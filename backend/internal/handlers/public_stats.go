package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PublicStatsHandler struct {
	DB *pgxpool.Pool
}

// Get returns live counts for the public marketing homepage stats bar.
func (h *PublicStatsHandler) Get(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var qrCodes, gs1Units int64
	err := h.DB.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM qr_tokens),
		       (SELECT COUNT(*) FROM gs1_label_units)
	`).Scan(&qrCodes, &gs1Units)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}

	return c.JSON(fiber.Map{"qr_codes": qrCodes, "gs1_units": gs1Units})
}
