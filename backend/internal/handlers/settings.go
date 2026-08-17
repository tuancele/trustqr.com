package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SettingsHandler manages the single-row system_settings table (admin-editable
// global configuration, e.g. scan-limit locking for QR and GS1 codes).
type SettingsHandler struct {
	DB *pgxpool.Pool
}

type scanLimitsResp struct {
	QRScanLimit  *int `json:"qr_scan_limit"`
	GS1ScanLimit *int `json:"gs1_scan_limit"`
}

func (h *SettingsHandler) GetScanLimits(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()
	var resp scanLimitsResp
	err := h.DB.QueryRow(ctx, `SELECT qr_scan_limit, gs1_scan_limit FROM system_settings WHERE id = 1`).
		Scan(&resp.QRScanLimit, &resp.GS1ScanLimit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}
	return c.JSON(resp)
}

type updateScanLimitsBody struct {
	QRScanLimit  *int `json:"qr_scan_limit"`
	GS1ScanLimit *int `json:"gs1_scan_limit"`
}

func (h *SettingsHandler) UpdateScanLimits(c *fiber.Ctx) error {
	var b updateScanLimitsBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.QRScanLimit != nil && *b.QRScanLimit < 1 {
		return c.Status(400).JSON(fiber.Map{"error": "qr_scan_limit_invalid"})
	}
	if b.GS1ScanLimit != nil && *b.GS1ScanLimit < 1 {
		return c.Status(400).JSON(fiber.Map{"error": "gs1_scan_limit_invalid"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()
	_, err := h.DB.Exec(ctx, `
		UPDATE system_settings SET qr_scan_limit = $1, gs1_scan_limit = $2, updated_at = NOW() WHERE id = 1
	`, b.QRScanLimit, b.GS1ScanLimit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}
	return c.JSON(fiber.Map{"ok": true})
}

// getScanLimit reads the configured limit for "qr" or "gs1" codes. A nil
// result means unlimited. DB errors are treated as unlimited (fail-open) so a
// settings-table hiccup never blocks genuine scans.
func getScanLimit(ctx context.Context, db *pgxpool.Pool, kind string) *int {
	var qr, gs1 *int
	if err := db.QueryRow(ctx, `SELECT qr_scan_limit, gs1_scan_limit FROM system_settings WHERE id = 1`).
		Scan(&qr, &gs1); err != nil {
		return nil
	}
	if kind == "gs1" {
		return gs1
	}
	return qr
}
