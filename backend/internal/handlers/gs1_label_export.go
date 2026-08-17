package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

// maxGS1ExportCopies bounds how many physical stickers a single print export
// can generate for one label — the admin prints 500-1000 units per lot, each
// carrying its own unique verify code (mirrors maxExportTokens for batches).
const maxGS1ExportCopies = 1000

// gs1BarcodeDPI is the raster resolution used to generate the Code128 source
// image before fpdf/SVG scale it into its ratio-derived physical box —
// 300 DPI is standard print quality and comfortably scannable.
const gs1BarcodeDPI = 300.0

// mmToPxAtDPI converts a physical mm length to a pixel count at dpi,
// clamped to a sane range so a badly-configured template ratio can't request
// a degenerate (0px) or excessive barcode source image.
func mmToPxAtDPI(mm, dpi float64) int {
	px := int(mm / 25.4 * dpi)
	if px < 100 {
		return 100
	}
	if px > 3000 {
		return 3000
	}
	return px
}

type GS1LabelExportHandler struct {
	DB            *pgxpool.Pool
	PublicBaseURL string
	Tokens        *services.TokenService
}

// gs1ExportFields is everything a print export can composite onto a label
// template: the GS1Fields used for the DataMatrix element string / barcode,
// plus the descriptive fields (product code, spec, size spec) that only
// exist as positionable text objects.
type gs1ExportFields struct {
	services.GS1Fields
	ProductCode string
	Spec        string
	SizeSpec    string
}

func loadGS1LabelFields(ctx context.Context, db *pgxpool.Pool, id int64) (gs1ExportFields, error) {
	var f gs1ExportFields
	var expiry *time.Time
	var productCode, spec, sizeSpec *string
	err := db.QueryRow(ctx, `
		SELECT gtin, manufacture_date, expiry_date, lot, serial, product_code, spec, size_spec
		FROM gs1_labels WHERE id = $1`, id,
	).Scan(&f.GTIN, &f.ManufactureDate, &expiry, &f.Lot, &f.Serial, &productCode, &spec, &sizeSpec)
	if err != nil {
		return f, err
	}
	if expiry != nil {
		f.ExpiryDate = *expiry
	}
	if productCode != nil {
		f.ProductCode = *productCode
	}
	if spec != nil {
		f.Spec = *spec
	}
	if sizeSpec != nil {
		f.SizeSpec = *sizeSpec
	}
	return f, nil
}

// gs1FieldValueMap builds the field->text lookup that
// RenderTiledGS1PDF/InjectGS1ObjectsIntoSVG use to resolve each positioned
// TextObjectConfig, keyed by the same field names the templates editor uses.
func gs1FieldValueMap(f gs1ExportFields) map[string]string {
	m := map[string]string{
		"gtin":         f.GTIN,
		"lot":          f.Lot,
		"serial":       f.Serial,
		"product_code": f.ProductCode,
		"spec":         f.Spec,
		"size_spec":    f.SizeSpec,
	}
	if !f.ManufactureDate.IsZero() {
		m["manufacture_date"] = f.ManufactureDate.Format("2/1/2006")
	}
	if !f.ExpiryDate.IsZero() {
		m["expiry_date"] = f.ExpiryDate.Format("2/1/2006")
	}
	return m
}

// createGS1Units generates `quantity` brand-new physical-sticker rows for a
// label — each gets its own unique verify_code, mirroring how CreateBatch
// bulk-inserts unique qr_tokens. Every export call is treated as its own
// print run, so codes are never reused or topped-up across exports.
func (h *GS1LabelExportHandler) createGS1Units(ctx context.Context, labelID int64, quantity int) ([]services.LabelToken, error) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var maxSerial int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(serial_no), 0) FROM gs1_label_units WHERE label_id = $1`, labelID).Scan(&maxSerial); err != nil {
		return nil, err
	}

	tokens := make([]services.LabelToken, quantity)
	rows := make([][]any, quantity)
	for i := 0; i < quantity; i++ {
		code, err := h.Tokens.Generate()
		if err != nil {
			return nil, err
		}
		serial := maxSerial + i + 1
		tokens[i] = services.LabelToken{
			Code: code,
			URL:  fmt.Sprintf("%s/auth/%s", h.PublicBaseURL, code),
		}
		rows[i] = []any{labelID, code, serial, "active"}
	}

	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"gs1_label_units"},
		[]string{"label_id", "verify_code", "serial_no", "status"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return tokens, nil
}

type gs1PDFExportBody struct {
	TemplateID  int64   `json:"template_id"`
	Quantity    int     `json:"quantity"`
	SheetPreset string  `json:"sheet_preset"`
	SheetWMM    float64 `json:"sheet_w_mm"`
	SheetHMM    float64 `json:"sheet_h_mm"`
	MarginMM    float64 `json:"margin_mm"`
	GutterMM    float64 `json:"gutter_mm"`
	QRPx        int     `json:"qr_px"`
}

// ExportPDF renders a print-ready, multi-copy-per-sheet PDF of a single GS1
// label repeated Quantity times, using a previously uploaded PNG/JPG label
// template (the same label_templates library used by the QR-token batch
// print flow) with the consumer verify QR composited at its saved position.
// The printed sticker carries only the verify QR — the GS1 DataMatrix stays
// an internal/preview-only artifact (see GetLabel), it is not printed.
func (h *GS1LabelExportHandler) ExportPDF(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	var b gs1PDFExportBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.Quantity <= 0 {
		b.Quantity = 1
	}
	if b.Quantity > maxGS1ExportCopies {
		return c.Status(400).JSON(fiber.Map{"error": "quantity_too_large", "max": maxGS1ExportCopies})
	}
	if b.MarginMM <= 0 {
		b.MarginMM = 5
	}
	if b.GutterMM <= 0 {
		b.GutterMM = 2
	}
	if b.QRPx <= 0 {
		b.QRPx = 320
	}
	if b.QRPx < 128 || b.QRPx > 1024 {
		return c.Status(400).JSON(fiber.Map{"error": "qr_px_out_of_range"})
	}

	sheetW, sheetH, err := resolveSheetSize(b.SheetPreset, b.SheetWMM, b.SheetHMM)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Minute)
	defer cancel()

	tpl, err := loadLabelTemplate(ctx, h.DB, b.TemplateID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "template_not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tpl.FileType != "png" && tpl.FileType != "jpg" {
		return c.Status(400).JSON(fiber.Map{"error": "template_not_raster"})
	}

	if _, err := services.GridLayout(sheetW, sheetH, b.MarginMM, b.GutterMM, tpl.WidthMM, tpl.HeightMM); err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	fields, err := loadGS1LabelFields(ctx, h.DB, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	tokens, err := h.createGS1Units(ctx, id, b.Quantity)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "unit_gen_failed", "detail": err.Error()})
	}

	imageFn := func(tok services.LabelToken) ([]byte, error) { return services.GenerateQRPNG(tok.URL, b.QRPx) }

	var pdfBytes []byte
	if tpl.IsGS1 {
		barcodePNG, genErr := services.GenerateBarcodePNG(fields.Serial,
			mmToPxAtDPI(tpl.GS1Layout.BarcodeWRatio*tpl.WidthMM, gs1BarcodeDPI),
			mmToPxAtDPI(tpl.GS1Layout.BarcodeHRatio*tpl.HeightMM, gs1BarcodeDPI))
		if genErr != nil {
			return c.Status(500).JSON(fiber.Map{"error": "barcode_gen_failed", "detail": genErr.Error()})
		}
		pdfBytes, err = services.RenderTiledGS1PDF(
			tpl.FilePath, tpl.FileType,
			sheetW, sheetH, tpl.WidthMM, tpl.HeightMM, b.MarginMM, b.GutterMM,
			tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio,
			tpl.GS1Layout, gs1FieldValueMap(fields), barcodePNG,
			tokens, imageFn,
		)
	} else {
		pdfBytes, err = services.RenderTiledPDF(
			tpl.FilePath, tpl.FileType,
			sheetW, sheetH, tpl.WidthMM, tpl.HeightMM, b.MarginMM, b.GutterMM,
			tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio,
			tokens, imageFn,
		)
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "render_failed", "detail": err.Error()})
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="gs1_%d_labels.pdf"`, id))
	return c.Send(pdfBytes)
}

type gs1SVGExportBody struct {
	TemplateID int64 `json:"template_id"`
	Quantity   int   `json:"quantity"`
	QRPx       int   `json:"qr_px"`
}

// ExportSVGZip returns a ZIP with one print-ready SVG per copy (the consumer
// verify QR composited into a previously uploaded vector label template).
func (h *GS1LabelExportHandler) ExportSVGZip(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	var b gs1SVGExportBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.Quantity <= 0 {
		b.Quantity = 1
	}
	if b.Quantity > maxGS1ExportCopies {
		return c.Status(400).JSON(fiber.Map{"error": "quantity_too_large", "max": maxGS1ExportCopies})
	}
	if b.QRPx <= 0 {
		b.QRPx = 320
	}
	if b.QRPx < 128 || b.QRPx > 1024 {
		return c.Status(400).JSON(fiber.Map{"error": "qr_px_out_of_range"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Minute)
	defer cancel()

	tpl, err := loadLabelTemplate(ctx, h.DB, b.TemplateID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "template_not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tpl.FileType != "svg" {
		return c.Status(400).JSON(fiber.Map{"error": "template_not_vector"})
	}

	svgBytes, err := os.ReadFile(tpl.FilePath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "template_file_read"})
	}

	fields, err := loadGS1LabelFields(ctx, h.DB, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	tokens, err := h.createGS1Units(ctx, id, b.Quantity)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "unit_gen_failed", "detail": err.Error()})
	}

	var barcodePNG []byte
	if tpl.IsGS1 {
		barcodePNG, err = services.GenerateBarcodePNG(fields.Serial,
			mmToPxAtDPI(tpl.GS1Layout.BarcodeWRatio*tpl.WidthMM, gs1BarcodeDPI),
			mmToPxAtDPI(tpl.GS1Layout.BarcodeHRatio*tpl.HeightMM, gs1BarcodeDPI))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "barcode_gen_failed", "detail": err.Error()})
		}
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	manifestBuf := &bytes.Buffer{}
	cw := csv.NewWriter(manifestBuf)
	cw.Write([]string{"filename", "verify_code", "gtin", "lot", "serial"})

	for i, tok := range tokens {
		qrPNG, err := services.GenerateQRPNG(tok.URL, b.QRPx)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "qr_render_failed", "detail": err.Error()})
		}
		var out []byte
		if tpl.IsGS1 {
			out, err = services.InjectGS1ObjectsIntoSVG(svgBytes, qrPNG, barcodePNG,
				tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio, tpl.GS1Layout, gs1FieldValueMap(fields), tpl.WidthMM, tpl.HeightMM)
		} else {
			out, err = services.InjectQRIntoSVG(svgBytes, qrPNG, tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio, tpl.WidthMM, tpl.HeightMM)
		}
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "render_failed", "detail": err.Error()})
		}
		filename := fmt.Sprintf("labels/gs1_%d_copy%d.svg", id, i+1)
		fw, err := zw.Create(filename)
		if err != nil {
			continue
		}
		fw.Write(out)
		cw.Write([]string{filename, tok.Code, fields.GTIN, fields.Lot, fields.Serial})
	}
	cw.Flush()

	mfw, _ := zw.Create("manifest.csv")
	mfw.Write(manifestBuf.Bytes())
	zw.Close()

	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="gs1_%d_labels_svg.zip"`, id))
	return c.Send(buf.Bytes())
}
