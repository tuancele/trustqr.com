package handlers

import (
	"bytes"
	"context"
	"errors"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

const maxTemplateUploadBytes = 15 * 1024 * 1024

type TemplateHandler struct {
	DB         *pgxpool.Pool
	Audit      *services.AuditLogger
	StorageDir string
}

type templateRow struct {
	ID             int64     `json:"id"`
	Name           string    `json:"name"`
	WidthMM        float64   `json:"width_mm"`
	HeightMM       float64   `json:"height_mm"`
	FileType       string    `json:"file_type"`
	QRXRatio       float64   `json:"qr_x_ratio"`
	QRYRatio       float64   `json:"qr_y_ratio"`
	QRSizeRatio    float64   `json:"qr_size_ratio"`
	IsGS1          bool      `json:"is_gs1"`
	BarcodeXRatio  float64   `json:"barcode_x_ratio"`
	BarcodeYRatio  float64   `json:"barcode_y_ratio"`
	BarcodeWRatio  float64   `json:"barcode_w_ratio"`
	BarcodeHRatio  float64   `json:"barcode_h_ratio"`
	Text1XRatio    float64   `json:"text1_x_ratio"`
	Text1YRatio    float64   `json:"text1_y_ratio"`
	Text1SizeRatio float64   `json:"text1_size_ratio"`
	Text2XRatio    float64   `json:"text2_x_ratio"`
	Text2YRatio    float64   `json:"text2_y_ratio"`
	Text2SizeRatio float64   `json:"text2_size_ratio"`
	CreatedAt      time.Time `json:"created_at"`
}

const templateColumns = `id, name, width_mm, height_mm, file_type, qr_x_ratio, qr_y_ratio, qr_size_ratio,
	is_gs1, barcode_x_ratio, barcode_y_ratio, barcode_w_ratio, barcode_h_ratio,
	text1_x_ratio, text1_y_ratio, text1_size_ratio, text2_x_ratio, text2_y_ratio, text2_size_ratio, created_at`

func scanTemplateRow(row pgx.Row) (templateRow, error) {
	var r templateRow
	err := row.Scan(&r.ID, &r.Name, &r.WidthMM, &r.HeightMM, &r.FileType,
		&r.QRXRatio, &r.QRYRatio, &r.QRSizeRatio, &r.IsGS1,
		&r.BarcodeXRatio, &r.BarcodeYRatio, &r.BarcodeWRatio, &r.BarcodeHRatio,
		&r.Text1XRatio, &r.Text1YRatio, &r.Text1SizeRatio,
		&r.Text2XRatio, &r.Text2YRatio, &r.Text2SizeRatio, &r.CreatedAt)
	return r, err
}

// -------- ADMIN: List --------

func (h *TemplateHandler) List(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT `+templateColumns+`
		FROM label_templates ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []templateRow{}
	for rows.Next() {
		if r, err := scanTemplateRow(rows); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// -------- ADMIN: Get one --------

func (h *TemplateHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	row := h.DB.QueryRow(ctx, `SELECT `+templateColumns+` FROM label_templates WHERE id = $1`, id)
	r, err := scanTemplateRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(r)
}

// -------- ADMIN: Upload --------

func (h *TemplateHandler) Create(c *fiber.Ctx) error {
	name := strings.TrimSpace(c.FormValue("name"))
	widthMM, errW := strconv.ParseFloat(c.FormValue("width_mm"), 64)
	heightMM, errH := strconv.ParseFloat(c.FormValue("height_mm"), 64)
	if name == "" || errW != nil || errH != nil || widthMM <= 0 || heightMM <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_fields"})
	}

	isGS1 := c.FormValue("is_gs1") == "true" || c.FormValue("is_gs1") == "on"

	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file_required"})
	}
	if fh.Size <= 0 || fh.Size > maxTemplateUploadBytes {
		return c.Status(400).JSON(fiber.Map{"error": "file_too_large"})
	}

	var fileType string
	switch strings.ToLower(filepath.Ext(fh.Filename)) {
	case ".png":
		fileType = "png"
	case ".jpg", ".jpeg":
		fileType = "jpg"
	case ".svg":
		fileType = "svg"
	default:
		return c.Status(400).JSON(fiber.Map{"error": "unsupported_file_type"})
	}

	src, err := fh.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_open"})
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxTemplateUploadBytes+1))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_read"})
	}
	if len(data) > maxTemplateUploadBytes {
		return c.Status(400).JSON(fiber.Map{"error": "file_too_large"})
	}

	switch fileType {
	case "png":
		if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid_png"})
		}
	case "jpg":
		cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid_jpeg"})
		}
		if cfg.ColorModel == color.CMYKModel {
			return c.Status(400).JSON(fiber.Map{"error": "cmyk_jpeg_unsupported"})
		}
	case "svg":
		sanitized, err := services.SanitizeSVG(data)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid_svg"})
		}
		data = sanitized
	}

	if err := os.MkdirAll(h.StorageDir, 0755); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "storage_dir"})
	}
	storedName := uuid.NewString() + "." + fileType
	fullPath := filepath.Join(h.StorageDir, storedName)
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO label_templates (name, width_mm, height_mm, file_type, file_path, is_gs1, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, name, widthMM, heightMM, fileType, fullPath, isGS1, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	h.Audit.Log(adminID, "label_template.create", "label_template", strconv.FormatInt(id, 10),
		fiber.Map{"name": name, "file_type": fileType}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// -------- ADMIN: Update QR position / name --------

type templatePatchBody struct {
	Name           *string  `json:"name"`
	QRXRatio       *float64 `json:"qr_x_ratio"`
	QRYRatio       *float64 `json:"qr_y_ratio"`
	QRSizeRatio    *float64 `json:"qr_size_ratio"`
	IsGS1          *bool    `json:"is_gs1"`
	BarcodeXRatio  *float64 `json:"barcode_x_ratio"`
	BarcodeYRatio  *float64 `json:"barcode_y_ratio"`
	BarcodeWRatio  *float64 `json:"barcode_w_ratio"`
	BarcodeHRatio  *float64 `json:"barcode_h_ratio"`
	Text1XRatio    *float64 `json:"text1_x_ratio"`
	Text1YRatio    *float64 `json:"text1_y_ratio"`
	Text1SizeRatio *float64 `json:"text1_size_ratio"`
	Text2XRatio    *float64 `json:"text2_x_ratio"`
	Text2YRatio    *float64 `json:"text2_y_ratio"`
	Text2SizeRatio *float64 `json:"text2_size_ratio"`
}

// ratio01 validates a *float64 lies within [0,1] (min=false) or (0,1] (min=true, exclusive lower bound).
func ratio01(v *float64, exclusiveMin bool) bool {
	if v == nil {
		return true
	}
	if exclusiveMin {
		return *v > 0 && *v <= 1
	}
	return *v >= 0 && *v <= 1
}

func (h *TemplateHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b templatePatchBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if !ratio01(b.QRXRatio, false) {
		return c.Status(400).JSON(fiber.Map{"error": "qr_x_ratio_out_of_range"})
	}
	if !ratio01(b.QRYRatio, false) {
		return c.Status(400).JSON(fiber.Map{"error": "qr_y_ratio_out_of_range"})
	}
	if !ratio01(b.QRSizeRatio, true) {
		return c.Status(400).JSON(fiber.Map{"error": "qr_size_ratio_out_of_range"})
	}
	if !ratio01(b.BarcodeXRatio, false) || !ratio01(b.BarcodeYRatio, false) ||
		!ratio01(b.BarcodeWRatio, true) || !ratio01(b.BarcodeHRatio, true) {
		return c.Status(400).JSON(fiber.Map{"error": "barcode_ratio_out_of_range"})
	}
	if !ratio01(b.Text1XRatio, false) || !ratio01(b.Text1YRatio, false) || !ratio01(b.Text1SizeRatio, true) {
		return c.Status(400).JSON(fiber.Map{"error": "text1_ratio_out_of_range"})
	}
	if !ratio01(b.Text2XRatio, false) || !ratio01(b.Text2YRatio, false) || !ratio01(b.Text2SizeRatio, true) {
		return c.Status(400).JSON(fiber.Map{"error": "text2_ratio_out_of_range"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE label_templates SET
			name = COALESCE($1, name),
			qr_x_ratio = COALESCE($2, qr_x_ratio),
			qr_y_ratio = COALESCE($3, qr_y_ratio),
			qr_size_ratio = COALESCE($4, qr_size_ratio),
			is_gs1 = COALESCE($5, is_gs1),
			barcode_x_ratio = COALESCE($6, barcode_x_ratio),
			barcode_y_ratio = COALESCE($7, barcode_y_ratio),
			barcode_w_ratio = COALESCE($8, barcode_w_ratio),
			barcode_h_ratio = COALESCE($9, barcode_h_ratio),
			text1_x_ratio = COALESCE($10, text1_x_ratio),
			text1_y_ratio = COALESCE($11, text1_y_ratio),
			text1_size_ratio = COALESCE($12, text1_size_ratio),
			text2_x_ratio = COALESCE($13, text2_x_ratio),
			text2_y_ratio = COALESCE($14, text2_y_ratio),
			text2_size_ratio = COALESCE($15, text2_size_ratio)
		WHERE id = $16
	`, b.Name, b.QRXRatio, b.QRYRatio, b.QRSizeRatio, b.IsGS1,
		b.BarcodeXRatio, b.BarcodeYRatio, b.BarcodeWRatio, b.BarcodeHRatio,
		b.Text1XRatio, b.Text1YRatio, b.Text1SizeRatio,
		b.Text2XRatio, b.Text2YRatio, b.Text2SizeRatio, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "label_template.update", "label_template", strconv.FormatInt(id, 10),
		fiber.Map{}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// -------- ADMIN: Delete --------

func (h *TemplateHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var filePath string
	err = h.DB.QueryRow(ctx, `DELETE FROM label_templates WHERE id = $1 RETURNING file_path`, id).Scan(&filePath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	_ = os.Remove(filePath)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "label_template.delete", "label_template", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}

// -------- ADMIN: Preview (raw file bytes, for the position editor / library thumbnails) --------

func (h *TemplateHandler) Preview(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath, fileType string
	err = h.DB.QueryRow(ctx, `SELECT file_path, file_type FROM label_templates WHERE id = $1`, id).
		Scan(&filePath, &fileType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_read"})
	}

	switch fileType {
	case "png":
		c.Set("Content-Type", "image/png")
	case "jpg":
		c.Set("Content-Type", "image/jpeg")
	case "svg":
		c.Set("Content-Type", "image/svg+xml")
	}
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "private, max-age=300")
	return c.Send(data)
}
