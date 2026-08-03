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

type DistributorHandler struct {
	DB    *pgxpool.Pool
	Audit *services.AuditLogger
}

type distributorBody struct {
	Name        string `json:"name"`
	ContactName string `json:"contact_name"`
	Phone       string `json:"phone"`
	Email       string `json:"email"`
	Address     string `json:"address"`
	City        string `json:"city"`
	District    string `json:"district"`
	Notes       string `json:"notes"`
	IsActive    *bool  `json:"is_active"`
}

func (h *DistributorHandler) List(c *fiber.Ctx) error {
	q := c.Query("q", "")
	includeInactive := c.Query("include_inactive") == "true"
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT d.id, d.name, d.contact_name, d.phone, d.city, d.is_active, d.created_at,
		       COUNT(t.id) AS token_count
		FROM distributors d
		LEFT JOIN qr_tokens t ON t.distributor_id = d.id
		WHERE ($1 = '' OR d.name ILIKE '%' || $1 || '%' OR d.contact_name ILIKE '%' || $1 || '%' OR d.phone ILIKE '%' || $1 || '%')
		  AND ($2::bool OR d.is_active = TRUE)
		GROUP BY d.id ORDER BY d.id DESC LIMIT 500`, q, includeInactive)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID          int64     `json:"id"`
		Name        string    `json:"name"`
		ContactName *string   `json:"contact_name"`
		Phone       *string   `json:"phone"`
		City        *string   `json:"city"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
		TokenCount  int       `json:"token_count"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Name, &r.ContactName, &r.Phone, &r.City,
			&r.IsActive, &r.CreatedAt, &r.TokenCount); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *DistributorHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var d struct {
		ID          int64     `json:"id"`
		Name        string    `json:"name"`
		ContactName *string   `json:"contact_name"`
		Phone       *string   `json:"phone"`
		Email       *string   `json:"email"`
		Address     *string   `json:"address"`
		City        *string   `json:"city"`
		District    *string   `json:"district"`
		Notes       *string   `json:"notes"`
		IsActive    bool      `json:"is_active"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err = h.DB.QueryRow(ctx, `
		SELECT id, name, contact_name, phone, email, address, city, district, notes, is_active, created_at
		FROM distributors WHERE id=$1
	`, id).Scan(&d.ID, &d.Name, &d.ContactName, &d.Phone, &d.Email, &d.Address, &d.City, &d.District,
		&d.Notes, &d.IsActive, &d.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(d)
}

func (h *DistributorHandler) Create(c *fiber.Ctx) error {
	var b distributorBody
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
		INSERT INTO distributors (name, contact_name, phone, email, address, city, district, notes, is_active, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
	`, b.Name, b.ContactName, b.Phone, b.Email, b.Address, b.City, b.District, b.Notes,
		active, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	h.Audit.Log(adminID, "distributor.create", "distributor", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *DistributorHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b distributorBody
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
		UPDATE distributors SET
			name=$1, contact_name=$2, phone=$3, email=$4, address=$5, city=$6, district=$7,
			notes=$8, is_active=$9
		WHERE id=$10
	`, b.Name, b.ContactName, b.Phone, b.Email, b.Address, b.City, b.District, b.Notes, active, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "distributor.update", "distributor", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *DistributorHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var tokenCount int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM qr_tokens WHERE distributor_id=$1`, id).Scan(&tokenCount)
	if tokenCount > 0 {
		_, err := h.DB.Exec(ctx, `UPDATE distributors SET is_active=FALSE WHERE id=$1`, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
		adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
		h.Audit.Log(adminID, "distributor.deactivate", "distributor", strconv.FormatInt(id, 10),
			fiber.Map{"token_count": tokenCount}, middleware.ClientIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"deactivated": true, "reason": "has_tokens", "token_count": tokenCount})
	}
	tag, err := h.DB.Exec(ctx, `DELETE FROM distributors WHERE id=$1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "distributor.delete", "distributor", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
