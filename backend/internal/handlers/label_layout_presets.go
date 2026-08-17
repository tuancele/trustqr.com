package handlers

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// LabelLayoutPresetHandler manages saved GS1 object-position layouts (QR +
// barcode + text objects) so an admin can apply a finished arrangement from
// one template onto another instead of repositioning everything by hand.
type LabelLayoutPresetHandler struct {
	DB    *pgxpool.Pool
	Audit *services.AuditLogger
}

type labelLayoutPresetBody struct {
	Name          string                      `json:"name"`
	QRXRatio      float64                     `json:"qr_x_ratio"`
	QRYRatio      float64                     `json:"qr_y_ratio"`
	QRSizeRatio   float64                     `json:"qr_size_ratio"`
	BarcodeXRatio float64                     `json:"barcode_x_ratio"`
	BarcodeYRatio float64                     `json:"barcode_y_ratio"`
	BarcodeWRatio float64                     `json:"barcode_w_ratio"`
	BarcodeHRatio float64                     `json:"barcode_h_ratio"`
	TextObjects   []services.TextObjectConfig `json:"text_objects"`
}

type labelLayoutPresetRow struct {
	ID            int64                       `json:"id"`
	Name          string                      `json:"name"`
	QRXRatio      float64                     `json:"qr_x_ratio"`
	QRYRatio      float64                     `json:"qr_y_ratio"`
	QRSizeRatio   float64                     `json:"qr_size_ratio"`
	BarcodeXRatio float64                     `json:"barcode_x_ratio"`
	BarcodeYRatio float64                     `json:"barcode_y_ratio"`
	BarcodeWRatio float64                     `json:"barcode_w_ratio"`
	BarcodeHRatio float64                     `json:"barcode_h_ratio"`
	TextObjects   []services.TextObjectConfig `json:"text_objects"`
	CreatedAt     time.Time                   `json:"created_at"`
}

const labelLayoutPresetColumns = `id, name, qr_x_ratio, qr_y_ratio, qr_size_ratio,
	barcode_x_ratio, barcode_y_ratio, barcode_w_ratio, barcode_h_ratio, text_objects, created_at`

func scanLabelLayoutPresetRow(row pgx.Row) (labelLayoutPresetRow, error) {
	var r labelLayoutPresetRow
	var textObjectsRaw []byte
	err := row.Scan(&r.ID, &r.Name, &r.QRXRatio, &r.QRYRatio, &r.QRSizeRatio,
		&r.BarcodeXRatio, &r.BarcodeYRatio, &r.BarcodeWRatio, &r.BarcodeHRatio,
		&textObjectsRaw, &r.CreatedAt)
	if err != nil {
		return r, err
	}
	r.TextObjects = []services.TextObjectConfig{}
	if len(textObjectsRaw) > 0 {
		_ = json.Unmarshal(textObjectsRaw, &r.TextObjects)
	}
	return r, nil
}

func (h *LabelLayoutPresetHandler) List(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `SELECT `+labelLayoutPresetColumns+`
		FROM label_layout_presets ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []labelLayoutPresetRow{}
	for rows.Next() {
		if r, err := scanLabelLayoutPresetRow(rows); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *LabelLayoutPresetHandler) Create(c *fiber.Ctx) error {
	var b labelLayoutPresetBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name_required"})
	}
	if b.TextObjects == nil {
		b.TextObjects = []services.TextObjectConfig{}
	}
	if !validateTextObjects(b.TextObjects) {
		return c.Status(400).JSON(fiber.Map{"error": "text_objects_invalid"})
	}
	textObjectsJSON, err := json.Marshal(b.TextObjects)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "text_objects_encode"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO label_layout_presets
			(name, qr_x_ratio, qr_y_ratio, qr_size_ratio,
			 barcode_x_ratio, barcode_y_ratio, barcode_w_ratio, barcode_h_ratio,
			 text_objects, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id
	`, b.Name, b.QRXRatio, b.QRYRatio, b.QRSizeRatio,
		b.BarcodeXRatio, b.BarcodeYRatio, b.BarcodeWRatio, b.BarcodeHRatio,
		textObjectsJSON, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	h.Audit.Log(adminID, "label_layout_preset.create", "label_layout_preset", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *LabelLayoutPresetHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM label_layout_presets WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "label_layout_preset.delete", "label_layout_preset", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
