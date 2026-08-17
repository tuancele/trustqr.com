package handlers

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

// GS1LabelHandler serves the standalone /admin/gs1 module: every GS1 field
// (GTIN/dates/lot/serial) plus descriptive product fields are typed in by
// the admin directly, with no dependency on the batches/qr_tokens/products
// tables used by the existing QR-token flow. A gs1_labels row is a product/
// lot DEFINITION — individual verify codes for physical printed stickers
// live in gs1_label_units, generated at export time (see gs1_label_export.go).
type GS1LabelHandler struct {
	DB            *pgxpool.Pool
	PublicBaseURL string
}

type gs1LabelReq struct {
	GTIN            string `json:"gtin"`
	ManufactureDate string `json:"manufacture_date"` // "YYYY-MM-DD"
	ExpiryDate      string `json:"expiry_date"`      // "YYYY-MM-DD", optional
	Lot             string `json:"lot"`
	Serial          string `json:"serial"`
	ProductName     string `json:"product_name"`
	ProductCode     string `json:"product_code"`
	Spec            string `json:"spec"`
	Unit            string `json:"unit"`
	Manufacturer    string `json:"manufacturer"`
	OriginCountry   string `json:"origin_country"`
	BrandID         *int64 `json:"brand_id"`
}

type gs1LabelRow struct {
	ID              int64      `json:"id"`
	GTIN            string     `json:"gtin"`
	ManufactureDate time.Time  `json:"manufacture_date"`
	ExpiryDate      *time.Time `json:"expiry_date"`
	Lot             string     `json:"lot"`
	Serial          string     `json:"serial"`
	ProductName     *string    `json:"product_name"`
	ProductCode     *string    `json:"product_code"`
	Spec            *string    `json:"spec"`
	Unit            *string    `json:"unit"`
	Manufacturer    *string    `json:"manufacturer"`
	OriginCountry   *string    `json:"origin_country"`
	BrandID         *int64     `json:"brand_id"`
	CreatedAt       time.Time  `json:"created_at"`
}

const gs1LabelColumns = `id, gtin, manufacture_date, expiry_date, lot, serial,
	product_name, product_code, spec, unit, manufacturer, origin_country, brand_id, created_at`

func scanGS1LabelRow(row pgx.Row) (gs1LabelRow, error) {
	var r gs1LabelRow
	err := row.Scan(&r.ID, &r.GTIN, &r.ManufactureDate, &r.ExpiryDate, &r.Lot, &r.Serial,
		&r.ProductName, &r.ProductCode, &r.Spec, &r.Unit, &r.Manufacturer, &r.OriginCountry, &r.BrandID, &r.CreatedAt)
	return r, err
}

// -------- Create a new manually-entered label --------

// validateGS1LabelReq parses and checksum-validates the GS1 fields shared by
// create and update, so a label can never be saved in a state that couldn't
// render as a valid GS1 DataMatrix.
func validateGS1LabelReq(req gs1LabelReq) (mfg time.Time, exp time.Time, status int, errResp fiber.Map) {
	var err error
	mfg, err = time.Parse("2006-01-02", req.ManufactureDate)
	if err != nil {
		return mfg, exp, 400, fiber.Map{"error": "manufacture_date_invalid"}
	}
	if req.ExpiryDate != "" {
		exp, err = time.Parse("2006-01-02", req.ExpiryDate)
		if err != nil {
			return mfg, exp, 400, fiber.Map{"error": "expiry_date_invalid"}
		}
	}
	if req.Lot == "" || req.Serial == "" {
		return mfg, exp, 400, fiber.Map{"error": "lot_and_serial_required"}
	}
	if _, err := services.BuildGS1ElementString(services.GS1Fields{
		GTIN: req.GTIN, ManufactureDate: mfg, ExpiryDate: exp, Lot: req.Lot, Serial: req.Serial,
	}); err != nil {
		return mfg, exp, 422, fiber.Map{"error": err.Error()}
	}
	return mfg, exp, 0, nil
}

func (h *GS1LabelHandler) CreateLabel(c *fiber.Ctx) error {
	var req gs1LabelReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}

	mfg, _, status, errResp := validateGS1LabelReq(req)
	if errResp != nil {
		return c.Status(status).JSON(errResp)
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	row := h.DB.QueryRow(ctx, `
		INSERT INTO gs1_labels (gtin, manufacture_date, expiry_date, lot, serial,
			product_name, product_code, spec, unit, manufacturer, origin_country, brand_id)
		VALUES ($1, $2, NULLIF($3,'')::DATE, $4, $5, NULLIF($6,''), NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), NULLIF($10,''), NULLIF($11,''), $12)
		RETURNING `+gs1LabelColumns, req.GTIN, mfg, req.ExpiryDate, req.Lot, req.Serial,
		req.ProductName, req.ProductCode, req.Spec, req.Unit, req.Manufacturer, req.OriginCountry, req.BrandID)

	r, err := scanGS1LabelRow(row)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(r)
}

// -------- Update an existing label's fields --------

func (h *GS1LabelHandler) UpdateLabel(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req gs1LabelReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}

	mfg, _, status, errResp := validateGS1LabelReq(req)
	if errResp != nil {
		return c.Status(status).JSON(errResp)
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	row := h.DB.QueryRow(ctx, `
		UPDATE gs1_labels SET
			gtin = $1, manufacture_date = $2, expiry_date = NULLIF($3,'')::DATE, lot = $4, serial = $5,
			product_name = NULLIF($6,''), product_code = NULLIF($7,''), spec = NULLIF($8,''),
			unit = NULLIF($9,''), manufacturer = NULLIF($10,''), origin_country = NULLIF($11,''), brand_id = $12
		WHERE id = $13
		RETURNING `+gs1LabelColumns, req.GTIN, mfg, req.ExpiryDate, req.Lot, req.Serial,
		req.ProductName, req.ProductCode, req.Spec, req.Unit, req.Manufacturer, req.OriginCountry, req.BrandID, id)

	r, err := scanGS1LabelRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(r)
}

// -------- List labels (search + paginate) --------

func (h *GS1LabelHandler) ListLabels(c *fiber.Ctx) error {
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if pageSize < 10 || pageSize > 500 {
		pageSize = 50
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	where := `$1 = '' OR gtin ILIKE '%'||$1||'%' OR lot ILIKE '%'||$1||'%'
		OR serial ILIKE '%'||$1||'%' OR product_name ILIKE '%'||$1||'%'`

	var total int
	if err := h.DB.QueryRow(ctx, "SELECT COUNT(*) FROM gs1_labels WHERE "+where, q).Scan(&total); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT `+gs1LabelColumns+` FROM gs1_labels WHERE `+where+`
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, q, pageSize, (page-1)*pageSize)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	defer rows.Close()

	items := []gs1LabelRow{}
	for rows.Next() {
		r, err := scanGS1LabelRow(rows)
		if err == nil {
			items = append(items, r)
		}
	}
	return c.JSON(fiber.Map{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// -------- Single label + element string (for preview/download) --------

type gs1LabelDetail struct {
	gs1LabelRow
	ElementString string `json:"element_string"`
	BrandName     string `json:"brand_name,omitempty"`
	BrandWebsite  string `json:"brand_website,omitempty"`
	BrandLogoURL  string `json:"brand_logo_url,omitempty"`
}

func (h *GS1LabelHandler) GetLabel(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	row := h.DB.QueryRow(ctx, "SELECT "+gs1LabelColumns+" FROM gs1_labels WHERE id = $1", id)
	r, err := scanGS1LabelRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	fields := services.GS1Fields{GTIN: r.GTIN, ManufactureDate: r.ManufactureDate, Lot: r.Lot, Serial: r.Serial}
	if r.ExpiryDate != nil {
		fields.ExpiryDate = *r.ExpiryDate
	}
	elementString, err := services.BuildGS1ElementString(fields)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	detail := gs1LabelDetail{gs1LabelRow: r, ElementString: elementString}
	if r.BrandID != nil {
		var name, website string
		var hasLogo bool
		if err := h.DB.QueryRow(ctx, `
			SELECT name, COALESCE(website,''), (logo_path IS NOT NULL) FROM brands WHERE id = $1
		`, *r.BrandID).Scan(&name, &website, &hasLogo); err == nil {
			detail.BrandName = name
			detail.BrandWebsite = website
			if hasLogo {
				detail.BrandLogoURL = fmt.Sprintf("/api/v1/brands/%d/logo/file", *r.BrandID)
			}
		}
	}

	return c.JSON(detail)
}

// -------- Print units (one row per physical sticker, created at export time) --------

type gs1UnitRow struct {
	ID             int64      `json:"id"`
	SerialNo       int        `json:"serial_no"`
	VerifyCode     string     `json:"verify_code"`
	ScanCount      int        `json:"scan_count"`
	FirstScannedAt *time.Time `json:"first_scanned_at"`
	FirstScanCity  *string    `json:"first_scan_city"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ListUnits returns the physical print units generated for a label across
// all export runs — each carries its own verify_code and scan history,
// mirroring ListBatchTokens for the qr_tokens flow.
func (h *GS1LabelHandler) ListUnits(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if pageSize < 10 || pageSize > 500 {
		pageSize = 50
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var total int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM gs1_label_units WHERE label_id = $1`, id).Scan(&total); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, serial_no, verify_code, scan_count, first_scanned_at, first_scan_city, status, created_at
		FROM gs1_label_units WHERE label_id = $1
		ORDER BY serial_no DESC LIMIT $2 OFFSET $3
	`, id, pageSize, (page-1)*pageSize)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	defer rows.Close()

	items := []gs1UnitRow{}
	for rows.Next() {
		var u gs1UnitRow
		if err := rows.Scan(&u.ID, &u.SerialNo, &u.VerifyCode, &u.ScanCount, &u.FirstScannedAt, &u.FirstScanCity, &u.Status, &u.CreatedAt); err == nil {
			items = append(items, u)
		}
	}
	return c.JSON(fiber.Map{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// GetUnitQRImage serves a single unit's verify QR (points at /auth/:code,
// separate from the shared DataMatrix).
func (h *GS1LabelHandler) GetUnitQRImage(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	pixel := 320
	if p := c.Query("px"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n >= 128 && n <= 1024 {
			pixel = n
		}
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var verifyCode string
	if err := h.DB.QueryRow(ctx, `SELECT verify_code FROM gs1_label_units WHERE id = $1`, id).Scan(&verifyCode); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	url := fmt.Sprintf("%s/auth/%s", h.PublicBaseURL, verifyCode)
	png, err := services.GenerateQRPNG(url, pixel)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "qr_gen"})
	}
	c.Set("Content-Type", "image/png")
	return c.Send(png)
}

// -------- Delete a label --------

func (h *GS1LabelHandler) DeleteLabel(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, "DELETE FROM gs1_labels WHERE id = $1", id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	return c.JSON(fiber.Map{"ok": true})
}
