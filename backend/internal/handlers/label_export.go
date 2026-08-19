package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

// maxExportTokens bounds memory use per export request so a low-spec server
// stays responsive: worst case is ~2000 unique QR images held/streamed at once.
const maxExportTokens = 2000

type LabelExportHandler struct {
	DB            *pgxpool.Pool
	PublicBaseURL string
}

type labelTemplateInfo struct {
	ID              int64
	WidthMM         float64
	HeightMM        float64
	FileType        string
	FilePath        string
	QRXRatio        float64
	QRYRatio        float64
	QRSizeRatio     float64
	IsGS1           bool
	GS1Layout       services.GS1Layout
	CutlineFilePath string
}

func loadLabelTemplate(ctx context.Context, db *pgxpool.Pool, id int64) (*labelTemplateInfo, error) {
	var t labelTemplateInfo
	var textObjectsRaw []byte
	var cutlineFilePath *string
	err := db.QueryRow(ctx, `
		SELECT id, width_mm, height_mm, file_type, file_path, qr_x_ratio, qr_y_ratio, qr_size_ratio,
			is_gs1, barcode_x_ratio, barcode_y_ratio, barcode_w_ratio, barcode_h_ratio, text_objects,
			cutline_file_path
		FROM label_templates WHERE id = $1`, id).Scan(
		&t.ID, &t.WidthMM, &t.HeightMM, &t.FileType, &t.FilePath,
		&t.QRXRatio, &t.QRYRatio, &t.QRSizeRatio, &t.IsGS1,
		&t.GS1Layout.BarcodeXRatio, &t.GS1Layout.BarcodeYRatio, &t.GS1Layout.BarcodeWRatio, &t.GS1Layout.BarcodeHRatio,
		&textObjectsRaw, &cutlineFilePath)
	if err != nil {
		return nil, err
	}
	if len(textObjectsRaw) > 0 {
		if err := json.Unmarshal(textObjectsRaw, &t.GS1Layout.TextObjects); err != nil {
			return nil, fmt.Errorf("parse text_objects: %w", err)
		}
	}
	if cutlineFilePath != nil {
		t.CutlineFilePath = *cutlineFilePath
	}
	return &t, nil
}

// pdfExtrasBody is the set of print-production fields shared by the plain-QR
// and GS1 PDF export request bodies: an optional page background color, the
// cutline-page opt-in, and the 4 eke corner-mark parameters. Embedded into
// both pdfExportBody and gs1PDFExportBody so the two export handlers stay in
// sync without duplicating field definitions.
type pdfExtrasBody struct {
	BackgroundColor  string  `json:"background_color"`
	IncludeCutline   bool    `json:"include_cutline"`
	EkeThicknessMM   float64 `json:"eke_thickness_mm"`
	EkeArmMM         float64 `json:"eke_arm_mm"`
	EkeTopOffsetMM   float64 `json:"eke_top_offset_mm"`
	EkeSideOffsetMM  float64 `json:"eke_side_offset_mm"`
}

// buildPDFExtras resolves a pdfExtrasBody + the chosen template into the
// services.PDFExtras RenderTiledPDF/RenderTiledGS1PDF need: parses the
// optional background color (white by default), fills in any unset eke
// parameters with DefaultEkeConfig's values, and — if the admin opted into a
// cutline page — loads and extracts the template's uploaded cutline SVG.
// Returns a plain error (not a fiber response) so callers can decide the
// right HTTP status per failure (400 vs 422 vs 500).
func buildPDFExtras(b pdfExtrasBody, tpl *labelTemplateInfo) (services.PDFExtras, error) {
	extras := services.PDFExtras{BackgroundColor: services.DefaultBackgroundColor, Eke: services.DefaultEkeConfig()}

	if b.BackgroundColor != "" {
		bg, err := services.ParseHexColor(b.BackgroundColor)
		if err != nil {
			return extras, err
		}
		extras.BackgroundColor = bg
	}

	if b.EkeThicknessMM > 0 {
		extras.Eke.ThicknessMM = b.EkeThicknessMM
	}
	if b.EkeArmMM > 0 {
		extras.Eke.ArmMM = b.EkeArmMM
	}
	if b.EkeTopOffsetMM > 0 {
		extras.Eke.TopOffsetMM = b.EkeTopOffsetMM
	}
	if b.EkeSideOffsetMM > 0 {
		extras.Eke.SideOffsetMM = b.EkeSideOffsetMM
	}

	if b.IncludeCutline {
		if tpl.CutlineFilePath == "" {
			return extras, fmt.Errorf("cutline_file_missing")
		}
		cutlineBytes, err := os.ReadFile(tpl.CutlineFilePath)
		if err != nil {
			return extras, fmt.Errorf("cutline_file_read: %w", err)
		}
		if err := services.ValidateCutlineSVG(cutlineBytes); err != nil {
			return extras, fmt.Errorf("cutline_parse_failed: %w", err)
		}
		extras.CutlineSVG = cutlineBytes
	}

	return extras, nil
}

// pdfExtrasErrorResponse maps a buildPDFExtras error to the right HTTP
// status: a missing/unparseable cutline file is a client-fixable request
// problem (422, matching the other layout-validation errors in this file),
// while a read failure on a file the DB says exists is a server-side fault.
func pdfExtrasErrorResponse(c *fiber.Ctx, err error) error {
	msg := err.Error()
	switch {
	case strings.HasPrefix(msg, "cutline_file_missing"):
		return c.Status(422).JSON(fiber.Map{"error": "cutline_file_missing"})
	case strings.HasPrefix(msg, "cutline_file_read"):
		return c.Status(500).JSON(fiber.Map{"error": "cutline_file_read"})
	case strings.HasPrefix(msg, "cutline_parse_failed"):
		return c.Status(422).JSON(fiber.Map{"error": "cutline_parse_failed", "detail": msg})
	default:
		return c.Status(400).JSON(fiber.Map{"error": "invalid_background_color", "detail": msg})
	}
}

func fetchLabelTokens(ctx context.Context, db *pgxpool.Pool, batchID int64, fromSerial, toSerial int, publicBaseURL string) ([]services.LabelToken, error) {
	rows, err := db.Query(ctx, `
		SELECT secret_code FROM qr_tokens
		WHERE batch_id = $1 AND serial_no BETWEEN $2 AND $3
		ORDER BY serial_no ASC
		LIMIT $4`, batchID, fromSerial, toSerial, maxExportTokens+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := make([]services.LabelToken, 0, toSerial-fromSerial+1)
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			continue
		}
		tokens = append(tokens, services.LabelToken{
			Code: code,
			URL:  fmt.Sprintf("%s/v/%s", publicBaseURL, code),
		})
	}
	return tokens, nil
}

func resolveSheetSize(preset string, wMM, hMM float64) (float64, float64, error) {
	if preset != "" {
		dims, ok := services.SheetPresets[preset]
		if !ok {
			return 0, 0, fmt.Errorf("unknown_sheet_preset")
		}
		return dims[0], dims[1], nil
	}
	if wMM <= 0 || hMM <= 0 {
		return 0, 0, fmt.Errorf("sheet_size_required")
	}
	return wMM, hMM, nil
}

type pdfExportBody struct {
	pdfExtrasBody
	TemplateID  int64   `json:"template_id"`
	FromSerial  int     `json:"from_serial"`
	ToSerial    int     `json:"to_serial"`
	SheetPreset string  `json:"sheet_preset"`
	SheetWMM    float64 `json:"sheet_w_mm"`
	SheetHMM    float64 `json:"sheet_h_mm"`
	MarginMM    float64 `json:"margin_mm"`
	GutterMM    float64 `json:"gutter_mm"`
	QRPx        int     `json:"qr_px"`
}

// ExportLabelsPDF renders a print-ready, multi-label-per-sheet PDF for a serial
// range of a batch, using a previously uploaded PNG/JPG label template with the
// QR composited at its saved position.
func (h *LabelExportHandler) ExportLabelsPDF(c *fiber.Ctx) error {
	batchID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	var b pdfExportBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.FromSerial <= 0 || b.ToSerial <= 0 || b.ToSerial < b.FromSerial {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_serial_range"})
	}
	if b.ToSerial-b.FromSerial+1 > maxExportTokens {
		return c.Status(400).JSON(fiber.Map{"error": "range_too_large", "max_tokens": maxExportTokens})
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

	tokens, err := fetchLabelTokens(ctx, h.DB, batchID, b.FromSerial, b.ToSerial, h.PublicBaseURL)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	if len(tokens) == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "no_tokens_in_range"})
	}

	extras, err := buildPDFExtras(b.pdfExtrasBody, tpl)
	if err != nil {
		return pdfExtrasErrorResponse(c, err)
	}

	tplFile, err := os.Open(tpl.FilePath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "template_file_read"})
	}
	defer tplFile.Close()

	pdfBytes, err := services.RenderTiledPDF(
		tplFile, tpl.FileType,
		sheetW, sheetH, tpl.WidthMM, tpl.HeightMM, b.MarginMM, b.GutterMM,
		tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio,
		tokens,
		func(tok services.LabelToken) ([]byte, error) { return services.GenerateQRPNG(tok.URL, b.QRPx) },
		extras,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "render_failed", "detail": err.Error()})
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="batch_%d_labels.pdf"`, batchID))
	return c.Send(pdfBytes)
}

type svgExportBody struct {
	TemplateID int64 `json:"template_id"`
	FromSerial int   `json:"from_serial"`
	ToSerial   int   `json:"to_serial"`
	QRPx       int   `json:"qr_px"`
}

// ExportLabelsSVGZip returns a ZIP with one print-ready SVG per token (QR
// composited into a previously uploaded vector label template), for serial
// ranges assigned to a batch.
func (h *LabelExportHandler) ExportLabelsSVGZip(c *fiber.Ctx) error {
	batchID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	var b svgExportBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.FromSerial <= 0 || b.ToSerial <= 0 || b.ToSerial < b.FromSerial {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_serial_range"})
	}
	if b.ToSerial-b.FromSerial+1 > maxExportTokens {
		return c.Status(400).JSON(fiber.Map{"error": "range_too_large", "max_tokens": maxExportTokens})
	}
	if b.QRPx <= 0 {
		b.QRPx = 256
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

	tokens, err := fetchLabelTokens(ctx, h.DB, batchID, b.FromSerial, b.ToSerial, h.PublicBaseURL)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	if len(tokens) == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "no_tokens_in_range"})
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	manifestBuf := &bytes.Buffer{}
	cw := csv.NewWriter(manifestBuf)
	cw.Write([]string{"filename", "secret_code", "full_url"})

	for _, tok := range tokens {
		qrPNG, err := services.GenerateQRPNG(tok.URL, b.QRPx)
		if err != nil {
			continue
		}
		out, err := services.InjectQRIntoSVG(svgBytes, qrPNG, tpl.QRXRatio, tpl.QRYRatio, tpl.QRSizeRatio, tpl.WidthMM, tpl.HeightMM)
		if err != nil {
			continue
		}
		filename := "labels/" + tok.Code + ".svg"
		fw, err := zw.Create(filename)
		if err != nil {
			continue
		}
		fw.Write(out)
		cw.Write([]string{filename, tok.Code, tok.URL})
	}
	cw.Flush()

	mfw, _ := zw.Create("manifest.csv")
	mfw.Write(manifestBuf.Bytes())
	zw.Close()

	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="batch_%d_labels_svg.zip"`, batchID))
	return c.Send(buf.Bytes())
}
