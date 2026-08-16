package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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

const maxProductImageBytes = 8 * 1024 * 1024
const maxProductImages = 12

type ProductHandler struct {
	DB         *pgxpool.Pool
	Audit      *services.AuditLogger
	StorageDir string
}

type productImageOut struct {
	ID  int64  `json:"id"`
	URL string `json:"url"`
}

func loadProductImages(ctx context.Context, db *pgxpool.Pool, productID int64) ([]productImageOut, error) {
	rows, err := db.Query(ctx, `
		SELECT id FROM product_images
		WHERE product_id = $1
		ORDER BY sort_order ASC, id ASC`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []productImageOut{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			out = append(out, productImageOut{
				ID:  id,
				URL: fmt.Sprintf("/api/v1/products/%d/images/%d/file", productID, id),
			})
		}
	}
	return out, nil
}

type productBody struct {
	Name              string `json:"name"`
	ShortDescription  string `json:"short_description"`
	FullDescription   string `json:"full_description"`
	Ingredients       string `json:"ingredients"`
	UsageInstructions string `json:"usage_instructions"`
	Warnings          string `json:"warnings"`
	CompanyID         *int64 `json:"company_id"`
	BrandID           *int64 `json:"brand_id"`
	ImporterCompany   string `json:"importer_company"`
	ImporterAddress   string `json:"importer_address"`
	ImporterPhone     string `json:"importer_phone"`
	OriginCountry     string `json:"origin_country"`
	Volume            string `json:"volume"`
	LicenseNumber     string `json:"license_number"`
	Barcode           string `json:"barcode"`
	GTIN              string `json:"gtin"`
	ProductCode       string `json:"product_code"`
	Spec              string `json:"spec"`
	Unit              string `json:"unit"`
	ImageURL          string `json:"image_url"`
	IsActive          *bool  `json:"is_active"`
}

// -------- ADMIN: List with search --------

func (h *ProductHandler) List(c *fiber.Ctx) error {
	q := c.Query("q", "")
	includeInactive := c.Query("include_inactive") == "true"

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	sql := `
		SELECT p.id, p.name, p.short_description, p.importer_company, p.volume,
		       p.license_number, p.is_active, p.created_at,
		       COUNT(b.id) AS batch_count
		FROM products p
		LEFT JOIN batches b ON b.product_id = p.id
		WHERE ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.importer_company ILIKE '%' || $1 || '%')
		  AND ($2::bool OR p.is_active = TRUE)
		GROUP BY p.id
		ORDER BY p.id DESC
		LIMIT 500`
	rows, err := h.DB.Query(ctx, sql, q, includeInactive)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID              int64     `json:"id"`
		Name            string    `json:"name"`
		ShortDesc       *string   `json:"short_description"`
		ImporterCompany *string   `json:"importer_company"`
		Volume          *string   `json:"volume"`
		LicenseNumber   *string   `json:"license_number"`
		IsActive        bool      `json:"is_active"`
		CreatedAt       time.Time `json:"created_at"`
		BatchCount      int       `json:"batch_count"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.Name, &r.ShortDesc, &r.ImporterCompany,
			&r.Volume, &r.LicenseNumber, &r.IsActive, &r.CreatedAt, &r.BatchCount); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// -------- ADMIN + PUBLIC: Get one --------

func (h *ProductHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var p struct {
		ID                int64             `json:"id"`
		Name              string            `json:"name"`
		ShortDescription  *string           `json:"short_description"`
		FullDescription   *string           `json:"full_description"`
		Ingredients       *string           `json:"ingredients"`
		UsageInstructions *string           `json:"usage_instructions"`
		Warnings          *string           `json:"warnings"`
		CompanyID         *int64            `json:"company_id"`
		BrandID           *int64            `json:"brand_id"`
		ImporterCompany   *string           `json:"importer_company"`
		ImporterAddress   *string           `json:"importer_address"`
		ImporterPhone     *string           `json:"importer_phone"`
		OriginCountry     *string           `json:"origin_country"`
		Volume            *string           `json:"volume"`
		LicenseNumber     *string           `json:"license_number"`
		Barcode           *string           `json:"barcode"`
		GTIN              *string           `json:"gtin"`
		ProductCode       *string           `json:"product_code"`
		Spec              *string           `json:"spec"`
		Unit              *string           `json:"unit"`
		ImageURL          *string           `json:"image_url"`
		IsActive          bool              `json:"is_active"`
		CreatedAt         time.Time         `json:"created_at"`
		UpdatedAt         time.Time         `json:"updated_at"`
		Images            []productImageOut `json:"images"`
	}
	err = h.DB.QueryRow(ctx, `
		SELECT id, name, short_description, full_description, ingredients,
		       usage_instructions, warnings, company_id, brand_id, importer_company, importer_address,
		       importer_phone, origin_country, volume, license_number, barcode, gtin,
		       product_code, spec, unit, image_url,
		       is_active, created_at, updated_at
		FROM products WHERE id = $1
	`, id).Scan(&p.ID, &p.Name, &p.ShortDescription, &p.FullDescription, &p.Ingredients,
		&p.UsageInstructions, &p.Warnings, &p.CompanyID, &p.BrandID, &p.ImporterCompany, &p.ImporterAddress,
		&p.ImporterPhone, &p.OriginCountry, &p.Volume, &p.LicenseNumber, &p.Barcode, &p.GTIN,
		&p.ProductCode, &p.Spec, &p.Unit, &p.ImageURL,
		&p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	images, err := loadProductImages(ctx, h.DB, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	p.Images = images
	return c.JSON(p)
}

// -------- ADMIN: Create --------

func (h *ProductHandler) Create(c *fiber.Ctx) error {
	var b productBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if b.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name_required"})
	}
	b.FullDescription = sanitizeDescriptionHTML(b.FullDescription)
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	active := true
	if b.IsActive != nil {
		active = *b.IsActive
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err := h.DB.QueryRow(ctx, `
		INSERT INTO products (name, short_description, full_description, ingredients,
			usage_instructions, warnings, company_id, brand_id, importer_company, importer_address, importer_phone,
			origin_country, volume, license_number, barcode, gtin, product_code, spec, unit, image_url, is_active, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
		RETURNING id
	`, b.Name, b.ShortDescription, b.FullDescription, b.Ingredients,
		b.UsageInstructions, b.Warnings, b.CompanyID, b.BrandID, b.ImporterCompany, b.ImporterAddress, b.ImporterPhone,
		b.OriginCountry, b.Volume, b.LicenseNumber, b.Barcode, b.GTIN, b.ProductCode, b.Spec, b.Unit,
		b.ImageURL, active, nullIfZeroInt64(adminID)).Scan(&id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	h.Audit.Log(adminID, "product.create", "product", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// -------- ADMIN: Update --------

func (h *ProductHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b productBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	b.FullDescription = sanitizeDescriptionHTML(b.FullDescription)
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	active := true
	if b.IsActive != nil {
		active = *b.IsActive
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE products SET
			name = $1, short_description = $2, full_description = $3, ingredients = $4,
			usage_instructions = $5, warnings = $6, company_id = $7, brand_id = $8, importer_company = $9, importer_address = $10,
			importer_phone = $11, origin_country = $12, volume = $13, license_number = $14,
			barcode = $15, gtin = $16, product_code = $17, spec = $18, unit = $19, image_url = $20, is_active = $21
		WHERE id = $22
	`, b.Name, b.ShortDescription, b.FullDescription, b.Ingredients,
		b.UsageInstructions, b.Warnings, b.CompanyID, b.BrandID, b.ImporterCompany, b.ImporterAddress, b.ImporterPhone,
		b.OriginCountry, b.Volume, b.LicenseNumber, b.Barcode, b.GTIN, b.ProductCode, b.Spec, b.Unit,
		b.ImageURL, active, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	h.Audit.Log(adminID, "product.update", "product", strconv.FormatInt(id, 10),
		fiber.Map{"name": b.Name}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// -------- ADMIN: Soft delete --------

func (h *ProductHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	// Check if any batches reference this product
	var batchCount int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM batches WHERE product_id = $1`, id).Scan(&batchCount)
	if batchCount > 0 {
		// Soft delete (deactivate)
		_, err := h.DB.Exec(ctx, `UPDATE products SET is_active = FALSE WHERE id = $1`, id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
		adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
		h.Audit.Log(adminID, "product.deactivate", "product", strconv.FormatInt(id, 10),
			fiber.Map{"batch_count": batchCount}, middleware.ClientIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"deactivated": true, "reason": "has_batches", "batch_count": batchCount})
	}
	// Hard delete if no batches
	imgRows, _ := h.DB.Query(ctx, `SELECT file_path FROM product_images WHERE product_id = $1`, id)
	var imgPaths []string
	if imgRows != nil {
		for imgRows.Next() {
			var p string
			if err := imgRows.Scan(&p); err == nil {
				imgPaths = append(imgPaths, p)
			}
		}
		imgRows.Close()
	}

	tag, err := h.DB.Exec(ctx, `DELETE FROM products WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	for _, p := range imgPaths {
		_ = os.Remove(p)
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "product.delete", "product", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}

// -------- ADMIN: Upload image --------

func (h *ProductHandler) UploadImage(c *fiber.Ctx) error {
	productID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil || !exists {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	var count int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM product_images WHERE product_id = $1`, productID).Scan(&count)
	if count >= maxProductImages {
		return c.Status(400).JSON(fiber.Map{"error": "too_many_images", "max": maxProductImages})
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file_required"})
	}
	if fh.Size <= 0 || fh.Size > maxProductImageBytes {
		return c.Status(400).JSON(fiber.Map{"error": "file_too_large"})
	}

	var fileType string
	switch strings.ToLower(filepath.Ext(fh.Filename)) {
	case ".png":
		fileType = "png"
	case ".jpg", ".jpeg":
		fileType = "jpg"
	default:
		return c.Status(400).JSON(fiber.Map{"error": "unsupported_file_type"})
	}

	src, err := fh.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_open"})
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxProductImageBytes+1))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_read"})
	}
	if len(data) > maxProductImageBytes {
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
	}

	if err := os.MkdirAll(h.StorageDir, 0755); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "storage_dir"})
	}
	storedName := uuid.NewString() + "." + fileType
	fullPath := filepath.Join(h.StorageDir, storedName)
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	var imgID int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO product_images (product_id, file_type, file_path, sort_order)
		VALUES ($1,$2,$3,$4)
		RETURNING id
	`, productID, fileType, fullPath, count).Scan(&imgID)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "product.image.create", "product", strconv.FormatInt(productID, 10),
		fiber.Map{"image_id": imgID}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(productImageOut{
		ID:  imgID,
		URL: fmt.Sprintf("/api/v1/products/%d/images/%d/file", productID, imgID),
	})
}

// -------- ADMIN: Delete image --------

func (h *ProductHandler) DeleteImage(c *fiber.Ctx) error {
	productID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	imageID, err := strconv.ParseInt(c.Params("imageId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_image_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var filePath string
	err = h.DB.QueryRow(ctx, `
		DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING file_path
	`, imageID, productID).Scan(&filePath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	_ = os.Remove(filePath)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "product.image.delete", "product", strconv.FormatInt(productID, 10),
		fiber.Map{"image_id": imageID}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}

// -------- PUBLIC: Serve image file --------

func (h *ProductHandler) ServeImage(c *fiber.Ctx) error {
	productID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	imageID, err := strconv.ParseInt(c.Params("imageId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_image_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath, fileType string
	err = h.DB.QueryRow(ctx, `
		SELECT file_path, file_type FROM product_images WHERE id = $1 AND product_id = $2
	`, imageID, productID).Scan(&filePath, &fileType)
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
