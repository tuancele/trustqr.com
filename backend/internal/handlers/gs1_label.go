package handlers

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// GS1LabelHandler serves the standalone /admin/gs1 module: every GS1 field
// (GTIN/dates/lot/serial) plus descriptive product fields are typed in by
// the admin directly, with no dependency on the batches/qr_tokens/products
// tables used by the existing QR-token flow. A gs1_labels row is a product/
// lot DEFINITION — individual verify codes for physical printed stickers
// live in gs1_label_units, generated at export time (see gs1_label_export.go).
type GS1LabelHandler struct {
	DB                     *pgxpool.Pool
	PublicBaseURL          string
	ProductImageStorageDir string
	DocumentStorageDir     string
	Audit                  *services.AuditLogger
}

type gs1LabelReq struct {
	GTIN            string `json:"gtin"`
	ManufactureDate string `json:"manufacture_date"` // "YYYY-MM-DD"
	ExpiryDate      string `json:"expiry_date"`      // "YYYY-MM-DD", optional
	Lot             string `json:"lot"`              // full lot; used as-is by UpdateLabel
	LotPrefix       string `json:"lot_prefix"`       // CreateLabel: exactly 3 chars = prefix (8 auto-generated chars appended); 4-20 chars = full lot, used as-is
	Serial          string `json:"serial"`           // full serial; used as-is by UpdateLabel
	SerialPrefix    string `json:"serial_prefix"`    // 3-char admin-entered prefix; CreateLabel appends 7 auto-generated chars
	ProductName     string `json:"product_name"`
	ProductCode     string `json:"product_code"`
	Spec            string `json:"spec"`
	SizeSpec        string `json:"size_spec"`
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
	SizeSpec        *string    `json:"size_spec"`
	Unit            *string    `json:"unit"`
	Manufacturer    *string    `json:"manufacturer"`
	OriginCountry   *string    `json:"origin_country"`
	BrandID         *int64     `json:"brand_id"`
	CreatedAt       time.Time  `json:"created_at"`

	Images    []gs1ImageItem    `json:"images"`
	Documents []gs1DocumentItem `json:"documents"`
}

// gs1ImageItem/gs1DocumentItem represent one row each in the gs1_label_images
// / gs1_label_documents child tables — a label may have up to maxGS1Images
// photos and maxGS1Documents certification files, each independently
// addable/removable from the admin UI.
type gs1ImageItem struct {
	ID  int64  `json:"id"`
	URL string `json:"url"`
}

type gs1DocumentItem struct {
	ID   int64  `json:"id"`
	URL  string `json:"url"`
	Name string `json:"name,omitempty"`
}

const maxGS1Images = 4
const maxGS1Documents = 4

const gs1LabelColumns = `id, gtin, manufacture_date, expiry_date, lot, serial,
	product_name, product_code, spec, size_spec, unit, manufacturer, origin_country, brand_id, created_at`

func scanGS1LabelRow(row pgx.Row) (gs1LabelRow, error) {
	var r gs1LabelRow
	err := row.Scan(&r.ID, &r.GTIN, &r.ManufactureDate, &r.ExpiryDate, &r.Lot, &r.Serial,
		&r.ProductName, &r.ProductCode, &r.Spec, &r.SizeSpec, &r.Unit, &r.Manufacturer, &r.OriginCountry, &r.BrandID, &r.CreatedAt)
	r.Images = []gs1ImageItem{}
	r.Documents = []gs1DocumentItem{}
	return r, err
}

func loadGS1Images(ctx context.Context, db *pgxpool.Pool, labelID int64) ([]gs1ImageItem, error) {
	rows, err := db.Query(ctx, `SELECT id FROM gs1_label_images WHERE label_id = $1 ORDER BY sort_order, id`, labelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []gs1ImageItem{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			continue
		}
		items = append(items, gs1ImageItem{ID: id, URL: fmt.Sprintf("/api/v1/gs1/images/%d/file", id)})
	}
	return items, nil
}

func loadGS1Documents(ctx context.Context, db *pgxpool.Pool, labelID int64) ([]gs1DocumentItem, error) {
	rows, err := db.Query(ctx, `SELECT id, file_name FROM gs1_label_documents WHERE label_id = $1 ORDER BY sort_order, id`, labelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []gs1DocumentItem{}
	for rows.Next() {
		var id int64
		var name *string
		if err := rows.Scan(&id, &name); err != nil {
			continue
		}
		item := gs1DocumentItem{ID: id, URL: fmt.Sprintf("/api/v1/gs1/documents/%d/file", id)}
		if name != nil {
			item.Name = *name
		}
		items = append(items, item)
	}
	return items, nil
}

// loadGS1AssetsForLabels batch-fetches images/documents for a page of labels
// (ListLabels) so that showing N rows doesn't cost 2N extra queries.
func loadGS1AssetsForLabels(ctx context.Context, db *pgxpool.Pool, labelIDs []int64) (map[int64][]gs1ImageItem, map[int64][]gs1DocumentItem, error) {
	images := map[int64][]gs1ImageItem{}
	docs := map[int64][]gs1DocumentItem{}
	if len(labelIDs) == 0 {
		return images, docs, nil
	}
	rows, err := db.Query(ctx, `SELECT id, label_id FROM gs1_label_images WHERE label_id = ANY($1) ORDER BY sort_order, id`, labelIDs)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var id, labelID int64
		if err := rows.Scan(&id, &labelID); err != nil {
			continue
		}
		images[labelID] = append(images[labelID], gs1ImageItem{ID: id, URL: fmt.Sprintf("/api/v1/gs1/images/%d/file", id)})
	}
	rows.Close()

	rows2, err := db.Query(ctx, `SELECT id, label_id, file_name FROM gs1_label_documents WHERE label_id = ANY($1) ORDER BY sort_order, id`, labelIDs)
	if err != nil {
		return nil, nil, err
	}
	for rows2.Next() {
		var id, labelID int64
		var name *string
		if err := rows2.Scan(&id, &labelID, &name); err != nil {
			continue
		}
		item := gs1DocumentItem{ID: id, URL: fmt.Sprintf("/api/v1/gs1/documents/%d/file", id)}
		if name != nil {
			item.Name = *name
		}
		docs[labelID] = append(docs[labelID], item)
	}
	rows2.Close()

	return images, docs, nil
}

// -------- Create a new manually-entered label --------

var serialPrefixRe = regexp.MustCompile(`^[A-Z0-9]{3}$`)

// fullLotRe matches a complete lot/batch value (AI 10) typed in full by the
// admin instead of a 3-char prefix — e.g. "R02K81VMR6V". When it matches,
// CreateLabel uses the value as-is and skips auto-generation.
var fullLotRe = regexp.MustCompile(`^[A-Z0-9]{4,20}$`)

const serialSuffixAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// generateSerialSuffix returns n random uppercase-alphanumeric characters,
// appended to the admin-entered 3-char prefix to form the full AI 21 serial
// — the admin only has to type a short, meaningful prefix, and the system
// guarantees the rest is unpredictable/unique.
func generateSerialSuffix(n int) (string, error) {
	b := make([]byte, n)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(serialSuffixAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = serialSuffixAlphabet[idx.Int64()]
	}
	return string(b), nil
}

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

	lotInput := strings.ToUpper(strings.TrimSpace(req.LotPrefix))
	switch {
	case serialPrefixRe.MatchString(lotInput):
		lotSuffix, err := generateSerialSuffix(8)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "lot_gen_failed"})
		}
		req.Lot = lotInput + lotSuffix
	case fullLotRe.MatchString(lotInput):
		req.Lot = lotInput
	default:
		return c.Status(400).JSON(fiber.Map{"error": "lot_prefix_invalid"})
	}

	prefix := strings.ToUpper(strings.TrimSpace(req.SerialPrefix))
	if !serialPrefixRe.MatchString(prefix) {
		return c.Status(400).JSON(fiber.Map{"error": "serial_prefix_invalid"})
	}
	suffix, err := generateSerialSuffix(7)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "serial_gen_failed"})
	}
	req.Serial = prefix + suffix

	mfg, _, status, errResp := validateGS1LabelReq(req)
	if errResp != nil {
		return c.Status(status).JSON(errResp)
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	row := h.DB.QueryRow(ctx, `
		INSERT INTO gs1_labels (gtin, manufacture_date, expiry_date, lot, serial,
			product_name, product_code, spec, size_spec, unit, manufacturer, origin_country, brand_id)
		VALUES ($1, $2, NULLIF($3,'')::DATE, $4, $5, NULLIF($6,''), NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), NULLIF($10,''), NULLIF($11,''), NULLIF($12,''), $13)
		RETURNING `+gs1LabelColumns, req.GTIN, mfg, req.ExpiryDate, req.Lot, req.Serial,
		req.ProductName, req.ProductCode, req.Spec, req.SizeSpec, req.Unit, req.Manufacturer, req.OriginCountry, req.BrandID)

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
			product_name = NULLIF($6,''), product_code = NULLIF($7,''), spec = NULLIF($8,''), size_spec = NULLIF($9,''),
			unit = NULLIF($10,''), manufacturer = NULLIF($11,''), origin_country = NULLIF($12,''), brand_id = $13
		WHERE id = $14
		RETURNING `+gs1LabelColumns, req.GTIN, mfg, req.ExpiryDate, req.Lot, req.Serial,
		req.ProductName, req.ProductCode, req.Spec, req.SizeSpec, req.Unit, req.Manufacturer, req.OriginCountry, req.BrandID, id)

	r, err := scanGS1LabelRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	r.Images, _ = loadGS1Images(ctx, h.DB, r.ID)
	r.Documents, _ = loadGS1Documents(ctx, h.DB, r.ID)
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
	rows.Close()

	ids := make([]int64, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	images, docs, err := loadGS1AssetsForLabels(ctx, h.DB, ids)
	if err == nil {
		for i := range items {
			items[i].Images = images[items[i].ID]
			items[i].Documents = docs[items[i].ID]
			if items[i].Images == nil {
				items[i].Images = []gs1ImageItem{}
			}
			if items[i].Documents == nil {
				items[i].Documents = []gs1DocumentItem{}
			}
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
	r.Images, _ = loadGS1Images(ctx, h.DB, r.ID)
	r.Documents, _ = loadGS1Documents(ctx, h.DB, r.ID)

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
	Serial         *string    `json:"serial"`
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
		SELECT id, serial_no, serial, verify_code, scan_count, first_scanned_at, first_scan_city, status, created_at
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
		if err := rows.Scan(&u.ID, &u.SerialNo, &u.Serial, &u.VerifyCode, &u.ScanCount, &u.FirstScannedAt, &u.FirstScanCity, &u.Status, &u.CreatedAt); err == nil {
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

	// Files aren't stored in the DB, so grab every child row's path before
	// the label delete cascades them away, then remove the files from disk.
	var imagePaths []string
	imgRows, err := h.DB.Query(ctx, `SELECT image_path FROM gs1_label_images WHERE label_id = $1`, id)
	if err == nil {
		for imgRows.Next() {
			var p string
			if imgRows.Scan(&p) == nil {
				imagePaths = append(imagePaths, p)
			}
		}
		imgRows.Close()
	}
	var docPaths []string
	docRows, err := h.DB.Query(ctx, `SELECT document_path FROM gs1_label_documents WHERE label_id = $1`, id)
	if err == nil {
		for docRows.Next() {
			var p string
			if docRows.Scan(&p) == nil {
				docPaths = append(docPaths, p)
			}
		}
		docRows.Close()
	}

	ct, err := h.DB.Exec(ctx, `DELETE FROM gs1_labels WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if ct.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	for _, p := range imagePaths {
		_ = os.Remove(p)
	}
	for _, p := range docPaths {
		_ = os.Remove(p)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// -------- ADMIN: Add a product photo (up to maxGS1Images per label) --------

func (h *GS1LabelHandler) AddProductImage(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM gs1_labels WHERE id = $1)`, id).Scan(&exists); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if !exists {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	var count int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM gs1_label_images WHERE label_id = $1`, id).Scan(&count); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if count >= maxGS1Images {
		return c.Status(400).JSON(fiber.Map{"error": "max_images_reached"})
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
	fullPath, err := saveImageFile(h.ProductImageStorageDir, fileType, data)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	var newID int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO gs1_label_images (label_id, image_path, file_type, sort_order)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, id, fullPath, fileType, count).Scan(&newID)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_label.product_image.add", "gs1_label", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(gs1ImageItem{ID: newID, URL: fmt.Sprintf("/api/v1/gs1/images/%d/file", newID)})
}

// -------- ADMIN: Delete one product photo by its own ID --------

func (h *GS1LabelHandler) DeleteProductImage(c *fiber.Ctx) error {
	imgID, err := strconv.ParseInt(c.Params("imageId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var path string
	var labelID int64
	err = h.DB.QueryRow(ctx, `DELETE FROM gs1_label_images WHERE id = $1 RETURNING image_path, label_id`, imgID).
		Scan(&path, &labelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	_ = os.Remove(path)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_label.product_image.delete", "gs1_label", strconv.FormatInt(labelID, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"ok": true})
}

// -------- PUBLIC: Serve one product photo by its own ID --------

func (h *GS1LabelHandler) ServeProductImage(c *fiber.Ctx) error {
	imgID, err := strconv.ParseInt(c.Params("imageId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath, fileType string
	err = h.DB.QueryRow(ctx, `SELECT image_path, file_type FROM gs1_label_images WHERE id = $1`, imgID).
		Scan(&filePath, &fileType)
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

// -------- ADMIN: Add a certification/document PDF (up to maxGS1Documents per label) --------

func (h *GS1LabelHandler) AddDocument(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM gs1_labels WHERE id = $1)`, id).Scan(&exists); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if !exists {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	var count int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM gs1_label_documents WHERE label_id = $1`, id).Scan(&count); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if count >= maxGS1Documents {
		return c.Status(400).JSON(fiber.Map{"error": "max_documents_reached"})
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file_required"})
	}
	data, err := readAndValidatePDF(fh)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	fullPath, err := saveImageFile(h.DocumentStorageDir, "pdf", data)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	var newID int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO gs1_label_documents (label_id, document_path, file_name, sort_order)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, id, fullPath, fh.Filename, count).Scan(&newID)
	if err != nil {
		_ = os.Remove(fullPath)
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_label.document.add", "gs1_label", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(gs1DocumentItem{ID: newID, URL: fmt.Sprintf("/api/v1/gs1/documents/%d/file", newID), Name: fh.Filename})
}

// -------- ADMIN: Delete one document by its own ID --------

func (h *GS1LabelHandler) DeleteDocument(c *fiber.Ctx) error {
	docID, err := strconv.ParseInt(c.Params("docId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var path string
	var labelID int64
	err = h.DB.QueryRow(ctx, `DELETE FROM gs1_label_documents WHERE id = $1 RETURNING document_path, label_id`, docID).
		Scan(&path, &labelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	_ = os.Remove(path)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_label.document.delete", "gs1_label", strconv.FormatInt(labelID, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"ok": true})
}

// -------- PUBLIC: Serve one document by its own ID --------

func (h *GS1LabelHandler) ServeDocument(c *fiber.Ctx) error {
	docID, err := strconv.ParseInt(c.Params("docId"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var filePath string
	var fileName *string
	err = h.DB.QueryRow(ctx, `SELECT document_path, file_name FROM gs1_label_documents WHERE id = $1`, docID).
		Scan(&filePath, &fileName)
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

	name := "document.pdf"
	if fileName != nil && *fileName != "" {
		name = *fileName
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "public, max-age=86400")
	c.Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, name))
	return c.Send(data)
}
