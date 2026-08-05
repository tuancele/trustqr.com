package handlers

import (
	"context"
	"errors"
	"os"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

type BrandHandler struct {
	DB         *pgxpool.Pool
	Audit      *services.AuditLogger
	StorageDir string
}

type brandBody struct {
	Name     string `json:"name"`
	Website  string `json:"website"`
	IsActive *bool  `json:"is_active"`
}

func (h *BrandHandler) List(c *fiber.Ctx) error {
	q := c.Query("q", "")
	includeInactive := c.Query("include_inactive") == "true"
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT b.id, b.name, b.website, (b.logo_path IS NOT NULL) AS has_logo,
		       b.is_active, b.created_at, COUNT(p.id) AS product_count
		FROM brands b
		LEFT JOIN products p ON p.brand_id = b.id
		WHERE ($1 = '' OR b.name ILIKE '%' || $1 || '%')
		  AND ($2::bool OR b.is_active = TRUE)
		GROUP BY b.id ORDER BY b.id DESC LIMIT 500`, q, includeInactive)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID           int64     `json:"id"`
		Name         string    `json:"name"`
		Website      *string   `json:"website"`
		HasLogo      bool      `json:"has_logo"`
		IsActive     bool      `json:"is_active"`
		CreatedAt    time.Time `json:"created_at"`
		ProductCount int       `json:"product_count"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Name, &r.Website, &r.HasLogo,
			&r.IsActive, &r.CreatedAt, &r.ProductCount); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *BrandHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var b struct {
		ID        int64     `json:"id"`
		Name      string    `json:"name"`
		Website   *string   `json:"website"`
		HasLogo   bool      `json:"has_logo"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}
	err = h.DB.QueryRow(ctx, `
		SELECT id, name, website, (logo_path IS NOT NULL), is_active, created_at
		FROM brands WHERE id = $1
	`, id).Scan(&b.ID, &b.Name, &b.Website, &b.HasLogo, &b.IsActive, &b.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(b)
}

func (h *BrandHandler) Create(c *fiber.Ctx) error {
	var b brandBody
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
		INSERT INTO brands (name, website, is_active, created_by)
		VALUES ($1,$2,$3,$4) RETURNING id
	`, b.Name, b.Website, active, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	h.Audit.Log(adminID, "brand.create", "brand", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *BrandHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b brandBody
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
		UPDATE brands SET name=$1, website=$2, is_active=$3 WHERE id=$4
	`, b.Name, b.Website, active, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "brand.update", "brand", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *BrandHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var productCount int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE brand_id=$1`, id).Scan(&productCount)
	if productCount > 0 {
		_, err := h.DB.Exec(ctx, `UPDATE brands SET is_active=FALSE WHERE id=$1`, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
		adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
		h.Audit.Log(adminID, "brand.deactivate", "brand", strconv.FormatInt(id, 10),
			fiber.Map{"product_count": productCount}, middleware.ClientIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"deactivated": true, "reason": "has_products", "product_count": productCount})
	}

	var logoPath *string
	err = h.DB.QueryRow(ctx, `DELETE FROM brands WHERE id=$1 RETURNING logo_path`, id).Scan(&logoPath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if logoPath != nil {
		_ = os.Remove(*logoPath)
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "brand.delete", "brand", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}

// -------- ADMIN: Upload logo --------

func (h *BrandHandler) UploadLogo(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	var oldLogoPath *string
	if err := h.DB.QueryRow(ctx, `SELECT logo_path FROM brands WHERE id = $1`, id).Scan(&oldLogoPath); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file_required"})
	}
	fileType := detectImageFileType(fh.Filename)
	if fileType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "unsupported_file_type"})
	}
	data, err := readAndValidateImage(fh, fileType)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	fullPath, err := saveImageFile(h.StorageDir, fileType, data)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	_, err = h.DB.Exec(ctx, `
		UPDATE brands SET logo_file_type = $1, logo_path = $2 WHERE id = $3
	`, fileType, fullPath, id)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if oldLogoPath != nil {
		_ = os.Remove(*oldLogoPath)
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "brand.logo.upload", "brand", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// -------- PUBLIC: Serve logo file --------

func (h *BrandHandler) ServeLogo(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath, fileType *string
	err = h.DB.QueryRow(ctx, `SELECT logo_path, logo_file_type FROM brands WHERE id = $1`, id).Scan(&filePath, &fileType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if filePath == nil || fileType == nil {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	data, err := os.ReadFile(*filePath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_read"})
	}

	switch *fileType {
	case "png":
		c.Set("Content-Type", "image/png")
	case "jpg":
		c.Set("Content-Type", "image/jpeg")
	}
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Send(data)
}
