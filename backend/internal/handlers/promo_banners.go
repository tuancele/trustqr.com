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

type PromoBannerHandler struct {
	DB         *pgxpool.Pool
	Audit      *services.AuditLogger
	StorageDir string
}

type promoBannerUpdateBody struct {
	LinkURL   *string `json:"link_url"`
	IsActive  *bool   `json:"is_active"`
	SortOrder *int    `json:"sort_order"`
}

// -------- ADMIN: List all (including inactive) --------

func (h *PromoBannerHandler) AdminList(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, link_url, sort_order, is_active, created_at
		FROM promo_banners ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID        int64     `json:"id"`
		URL       string    `json:"url"`
		LinkURL   *string   `json:"link_url"`
		SortOrder int       `json:"sort_order"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.LinkURL, &r.SortOrder, &r.IsActive, &r.CreatedAt); err == nil {
			r.URL = "/api/v1/banners/" + strconv.FormatInt(r.ID, 10) + "/file"
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// -------- ADMIN: Create (upload image + optional link_url) --------

func (h *PromoBannerHandler) Create(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

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

	linkURL := c.FormValue("link_url")
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	var id int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO promo_banners (file_type, file_path, link_url, sort_order, created_by)
		VALUES ($1,$2,$3, (SELECT COALESCE(MAX(sort_order),-1)+1 FROM promo_banners), $4)
		RETURNING id
	`, fileType, fullPath, nullIfEmptyString(linkURL), nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	h.Audit.Log(adminID, "banner.create", "banner", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id, "url": "/api/v1/banners/" + strconv.FormatInt(id, 10) + "/file"})
}

// -------- ADMIN: Update (link_url / is_active / sort_order) --------

func (h *PromoBannerHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b promoBannerUpdateBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()
	tag, err := h.DB.Exec(ctx, `
		UPDATE promo_banners SET
			link_url = COALESCE($1, link_url),
			is_active = COALESCE($2, is_active),
			sort_order = COALESCE($3, sort_order)
		WHERE id = $4
	`, b.LinkURL, b.IsActive, b.SortOrder, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "banner.update", "banner", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// -------- ADMIN: Delete --------

func (h *PromoBannerHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var filePath string
	err = h.DB.QueryRow(ctx, `DELETE FROM promo_banners WHERE id = $1 RETURNING file_path`, id).Scan(&filePath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	_ = os.Remove(filePath)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "banner.delete", "banner", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}

// -------- PUBLIC: List active banners --------

func (h *PromoBannerHandler) PublicList(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, link_url FROM promo_banners
		WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID      int64   `json:"id"`
		URL     string  `json:"url"`
		LinkURL *string `json:"link_url"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.LinkURL); err == nil {
			r.URL = "/api/v1/banners/" + strconv.FormatInt(r.ID, 10) + "/file"
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// -------- PUBLIC: Serve image file --------

func (h *PromoBannerHandler) ServeImage(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath, fileType string
	err = h.DB.QueryRow(ctx, `SELECT file_path, file_type FROM promo_banners WHERE id = $1`, id).Scan(&filePath, &fileType)
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
	}
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Send(data)
}
