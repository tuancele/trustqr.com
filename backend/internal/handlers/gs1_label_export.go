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

// maxGS1ExportCopies bounds how many repeated copies of one label a single
// print export can produce — this module has no serial-range concept
// (GS1 labels are entered individually), so quantity stands in for it.
const maxGS1ExportCopies = 500

type GS1LabelExportHandler struct {
	DB            *pgxpool.Pool
	PublicBaseURL string
}

func loadGS1LabelFields(ctx context.Context, db *pgxpool.Pool, id int64) (services.GS1Fields, error) {
	var f services.GS1Fields
	var expiry *time.Time
	err := db.QueryRow(ctx, `
		SELECT gtin, manufacture_date, expiry_date, lot, serial
		FROM gs1_labels WHERE id = $1`, id,
	).Scan(&f.GTIN, &f.ManufactureDate, &expiry, &f.Lot, &f.Serial)
	if err != nil {
		return f, err
	}
	if expiry != nil {
		f.ExpiryDate = *expiry
	}
	return f, nil
}

type gs1PDFExportBody struct {
	TemplateID  int64   `json:"template_id"`
	Quantity    int     `json:"quantity"`
	SheetPreset string  `json:"sheet_preset"`
	SheetWMM    float64 `json:"sheet_w_mm"`
	SheetHMM    float64 `json:"sheet_h_mm"`
	MarginMM    float64 `json:"margin_mm"`
	GutterMM    float64 `json:"gutter_mm"`
	DMScale     int     `json:"dm_scale"`
}

// ExportPDF renders a print-ready, multi-copy-per-sheet PDF of a single GS1
// label repeated Quantity times, using a previously uploaded PNG/JPG label
// template (the same label_templates library used by the QR-token batch
// print flow) with the DataMatrix composited at its saved position.
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
	if b.DMScale <= 0 {
		b.DMScale = 8
	}
	if b.DMScale < 2 || b.DMScale > 12 {
		return c.Status(400).JSON(fiber.Map{"error": "dm_scale_out_of_range"})
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
	elementString, err := services.BuildGS1ElementString(fields)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	dmPNG, err := services.FetchGS1DataMatrixPNG(h.PublicBaseURL, elementString, b.DMScale)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": "datamatrix_render_failed", "detail": err.Error()})
	}

	// Same DataMatrix image for every copy — imageFn ignores the token and
	// returns the pre-fetched bytes; Code just needs to be unique per cell
	// so fpdf doesn't collide image names across copies.
	tokens := make([]services.LabelToken, b.Quantity)
	for i := range tokens {
		tokens[i] = services.LabelToken{Code: fmt.Sprintf("gs1_%d_copy%d", id, i+1)}
	}

	pdfBytes, err := services.RenderTiledPDF(
		tpl.FilePath, tpl.FileType,
		sheetW, sheetH, tpl.WidthMM, tpl.HeightMM, b.MarginMM, b.GutterMM,
		tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio,
		tokens,
		func(services.LabelToken) ([]byte, error) { return dmPNG, nil },
	)
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
	DMScale    int   `json:"dm_scale"`
}

// ExportSVGZip returns a ZIP with one print-ready SVG per copy (DataMatrix
// composited into a previously uploaded vector label template).
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
	if b.DMScale <= 0 {
		b.DMScale = 8
	}
	if b.DMScale < 2 || b.DMScale > 12 {
		return c.Status(400).JSON(fiber.Map{"error": "dm_scale_out_of_range"})
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
	elementString, err := services.BuildGS1ElementString(fields)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	dmPNG, err := services.FetchGS1DataMatrixPNG(h.PublicBaseURL, elementString, b.DMScale)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": "datamatrix_render_failed", "detail": err.Error()})
	}

	out, err := services.InjectQRIntoSVG(svgBytes, dmPNG, tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio, tpl.WidthMM, tpl.HeightMM)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "render_failed", "detail": err.Error()})
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	manifestBuf := &bytes.Buffer{}
	cw := csv.NewWriter(manifestBuf)
	cw.Write([]string{"filename", "gtin", "lot", "serial", "element_string"})

	for i := 1; i <= b.Quantity; i++ {
		filename := fmt.Sprintf("labels/gs1_%d_copy%d.svg", id, i)
		fw, err := zw.Create(filename)
		if err != nil {
			continue
		}
		fw.Write(out)
		cw.Write([]string{filename, fields.GTIN, fields.Lot, fields.Serial, elementString})
	}
	cw.Flush()

	mfw, _ := zw.Create("manifest.csv")
	mfw.Write(manifestBuf.Bytes())
	zw.Close()

	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="gs1_%d_labels_svg.zip"`, id))
	return c.Send(buf.Bytes())
}
