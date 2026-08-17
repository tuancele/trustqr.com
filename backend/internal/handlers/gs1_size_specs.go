package handlers

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// GS1SizeSpecHandler manages the brand-scoped Quy cách -> GTIN / Kích thước
// reference table (/admin/sizes) used to auto-fill the GS1 label create form.
type GS1SizeSpecHandler struct {
	DB    *pgxpool.Pool
	Audit *services.AuditLogger
}

type gs1SizeSpecBody struct {
	BrandID     int64  `json:"brand_id"`
	Spec        string `json:"spec"`
	SizeSpec    string `json:"size_spec"`
	GTIN        string `json:"gtin"`
	ProductCode string `json:"product_code"`
	ProductLine string `json:"product_line"`
	Verified    bool   `json:"verified"`
}

type gs1SizeSpecRow struct {
	ID          int64     `json:"id"`
	BrandID     int64     `json:"brand_id"`
	Spec        string    `json:"spec"`
	SizeSpec    *string   `json:"size_spec"`
	GTIN        *string   `json:"gtin"`
	ProductCode *string   `json:"product_code"`
	ProductLine *string   `json:"product_line"`
	Verified    bool      `json:"verified"`
	CreatedAt   time.Time `json:"created_at"`
}

func (h *GS1SizeSpecHandler) List(c *fiber.Ctx) error {
	brandID, err := strconv.ParseInt(c.Query("brand_id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "brand_id_required"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, brand_id, spec, size_spec, gtin, product_code, product_line, verified, created_at
		FROM gs1_size_specs WHERE brand_id = $1 ORDER BY product_line ASC NULLS LAST, spec ASC`, brandID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []gs1SizeSpecRow{}
	for rows.Next() {
		var r gs1SizeSpecRow
		if err := rows.Scan(&r.ID, &r.BrandID, &r.Spec, &r.SizeSpec, &r.GTIN, &r.ProductCode, &r.ProductLine, &r.Verified, &r.CreatedAt); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *GS1SizeSpecHandler) Create(c *fiber.Ctx) error {
	var b gs1SizeSpecBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.BrandID == 0 || b.Spec == "" {
		return c.Status(400).JSON(fiber.Map{"error": "brand_and_spec_required"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err := h.DB.QueryRow(ctx, `
		INSERT INTO gs1_size_specs (brand_id, spec, size_spec, gtin, product_code, product_line, verified)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
	`, b.BrandID, b.Spec, nullIfEmpty(b.SizeSpec), nullIfEmpty(b.GTIN), nullIfEmpty(b.ProductCode), nullIfEmpty(b.ProductLine), b.Verified).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	h.Audit.Log(adminID, "gs1_size_spec.create", "gs1_size_spec", strconv.FormatInt(id, 10),
		fiber.Map{"brand_id": b.BrandID, "spec": b.Spec}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *GS1SizeSpecHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b gs1SizeSpecBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.Spec == "" {
		return c.Status(400).JSON(fiber.Map{"error": "spec_required"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()
	tag, err := h.DB.Exec(ctx, `
		UPDATE gs1_size_specs SET spec=$1, size_spec=$2, gtin=$3, product_code=$4, product_line=$5, verified=$6 WHERE id=$7
	`, b.Spec, nullIfEmpty(b.SizeSpec), nullIfEmpty(b.GTIN), nullIfEmpty(b.ProductCode), nullIfEmpty(b.ProductLine), b.Verified, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "gs1_size_spec.update", "gs1_size_spec", strconv.FormatInt(id, 10),
		fiber.Map{"spec": b.Spec}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *GS1SizeSpecHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM gs1_size_specs WHERE id=$1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_size_spec.delete", "gs1_size_spec", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
