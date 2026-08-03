package handlers

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

type CompanyHandler struct {
	DB    *pgxpool.Pool
	Audit *services.AuditLogger
}

type companyBody struct {
	Name        string `json:"name"`
	TaxCode     string `json:"tax_code"`
	Address     string `json:"address"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	Website     string `json:"website"`
	Description string `json:"description"`
	LogoURL     string `json:"logo_url"`
	IsActive    *bool  `json:"is_active"`
}

func (h *CompanyHandler) List(c *fiber.Ctx) error {
	q := c.Query("q", "")
	includeInactive := c.Query("include_inactive") == "true"
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT c.id, c.name, c.tax_code, c.address, c.phone, c.email, c.website,
		       c.is_active, c.created_at, COUNT(p.id) AS product_count
		FROM companies c
		LEFT JOIN products p ON p.company_id = c.id
		WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.tax_code ILIKE '%' || $1 || '%')
		  AND ($2::bool OR c.is_active = TRUE)
		GROUP BY c.id ORDER BY c.id DESC LIMIT 500`, q, includeInactive)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID           int64     `json:"id"`
		Name         string    `json:"name"`
		TaxCode      *string   `json:"tax_code"`
		Address      *string   `json:"address"`
		Phone        *string   `json:"phone"`
		Email        *string   `json:"email"`
		Website      *string   `json:"website"`
		IsActive     bool      `json:"is_active"`
		CreatedAt    time.Time `json:"created_at"`
		ProductCount int       `json:"product_count"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Name, &r.TaxCode, &r.Address, &r.Phone,
			&r.Email, &r.Website, &r.IsActive, &r.CreatedAt, &r.ProductCount); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *CompanyHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var comp struct {
		ID          int64     `json:"id"`
		Name        string    `json:"name"`
		TaxCode     *string   `json:"tax_code"`
		Address     *string   `json:"address"`
		Phone       *string   `json:"phone"`
		Email       *string   `json:"email"`
		Website     *string   `json:"website"`
		Description *string   `json:"description"`
		LogoURL     *string   `json:"logo_url"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err = h.DB.QueryRow(ctx, `
		SELECT id, name, tax_code, address, phone, email, website, description, logo_url, is_active, created_at
		FROM companies WHERE id = $1
	`, id).Scan(&comp.ID, &comp.Name, &comp.TaxCode, &comp.Address, &comp.Phone,
		&comp.Email, &comp.Website, &comp.Description, &comp.LogoURL, &comp.IsActive, &comp.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(comp)
}

func (h *CompanyHandler) Create(c *fiber.Ctx) error {
	var b companyBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name_required"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	active := true
	if b.IsActive != nil {
		active = *b.IsActive
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err := h.DB.QueryRow(ctx, `
		INSERT INTO companies (name, tax_code, address, phone, email, website, description, logo_url, is_active, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
	`, b.Name, b.TaxCode, b.Address, b.Phone, b.Email, b.Website, b.Description, b.LogoURL,
		active, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	h.Audit.Log(adminID, "company.create", "company", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *CompanyHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b companyBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	active := true
	if b.IsActive != nil {
		active = *b.IsActive
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()
	tag, err := h.DB.Exec(ctx, `
		UPDATE companies SET
			name=$1, tax_code=$2, address=$3, phone=$4, email=$5, website=$6,
			description=$7, logo_url=$8, is_active=$9
		WHERE id=$10
	`, b.Name, b.TaxCode, b.Address, b.Phone, b.Email, b.Website, b.Description, b.LogoURL, active, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "company.update", "company", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *CompanyHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var productCount int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1`, id).Scan(&productCount)
	if productCount > 0 {
		_, err := h.DB.Exec(ctx, `UPDATE companies SET is_active=FALSE WHERE id=$1`, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
		adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
		h.Audit.Log(adminID, "company.deactivate", "company", strconv.FormatInt(id, 10),
			fiber.Map{"product_count": productCount}, middleware.ClientIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"deactivated": true, "reason": "has_products", "product_count": productCount})
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM companies WHERE id=$1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "company.delete", "company", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
