package handlers

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// GS1VerifyHandler serves the public consumer-facing verification page for
// GS1 labels (/auth/:code on the frontend) — separate from qr.go's
// QRHandler, which verifies the batches/qr_tokens flow. Both reuse the same
// token scheme (services.TokenService) but resolve against different tables,
// so a code from one namespace never resolves in the other.
type GS1VerifyHandler struct {
	DB     *pgxpool.Pool
	Redis  *redis.Client
	Tokens *services.TokenService
	Geo    *services.GeoLookup
}

type gs1VerifyReq struct {
	Code string `json:"code"`
}

type gs1VerifyResp struct {
	Valid           bool    `json:"valid"`
	GTIN            string  `json:"gtin,omitempty"`
	Lot             string  `json:"lot,omitempty"`
	Serial          string  `json:"serial,omitempty"`
	ManufactureDate string  `json:"manufacture_date,omitempty"`
	ExpiryDate      string  `json:"expiry_date,omitempty"`
	ProductName     string  `json:"product_name,omitempty"`
	ProductCode     string  `json:"product_code,omitempty"`
	Spec            string  `json:"spec,omitempty"`
	Unit            string  `json:"unit,omitempty"`
	Manufacturer    string  `json:"manufacturer,omitempty"`
	OriginCountry   string  `json:"origin_country,omitempty"`
	ScanCount       int     `json:"scan_count"`
	IsFirstScan     bool    `json:"is_first_scan"`
	FirstScannedAt  *string `json:"first_scanned_at,omitempty"`
	FirstScanCity   string  `json:"first_scan_city,omitempty"`
	Warning         string  `json:"warning,omitempty"`
}

func (h *GS1VerifyHandler) Verify(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")

	var req gs1VerifyReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	// Offline HMAC check FIRST — reject invalid tokens without touching DB.
	if !h.Tokens.Verify(req.Code) {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_code"})
	}

	ip := middleware.ClientIP(c)
	ua := c.Get("User-Agent")
	city, region, country := h.Geo.Lookup(ip)
	deviceType, osName, osVersion, browserName, browserVersion := services.ParseUA(ua)

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var (
		unitID          int64
		labelID         int64
		gtin            string
		manufactureDate time.Time
		expiryDate      *time.Time
		lot             string
		serial          string
		productName     *string
		productCode     *string
		spec            *string
		unit            *string
		manufacturer    *string
		originCountry   *string
		scanCount       int
		firstScannedAt  *time.Time
		firstScanCity   string
		status          string
	)
	err := h.DB.QueryRow(ctx, `
		UPDATE gs1_label_units
		SET scan_count = scan_count + 1,
		    first_scanned_at = COALESCE(first_scanned_at, NOW()),
		    first_scan_city  = COALESCE(first_scan_city, $2),
		    first_scan_ip    = COALESCE(first_scan_ip, $3::inet)
		WHERE verify_code = $1
		RETURNING id, label_id, scan_count, first_scanned_at, COALESCE(first_scan_city,''), status
	`, req.Code, city, nullIfEmpty(ip)).Scan(&unitID, &labelID, &scanCount, &firstScannedAt, &firstScanCity, &status)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "code_not_issued"})
		}
		log.Printf("gs1 verify db error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}

	err = h.DB.QueryRow(ctx, `
		SELECT gtin, manufacture_date, expiry_date, lot, serial,
		       product_name, product_code, spec, unit, manufacturer, origin_country
		FROM gs1_labels WHERE id = $1
	`, labelID).Scan(&gtin, &manufactureDate, &expiryDate, &lot, &serial,
		&productName, &productCode, &spec, &unit, &manufacturer, &originCountry)
	if err != nil {
		log.Printf("gs1 verify label lookup error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}

	go func() {
		bg, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := h.DB.Exec(bg, `
			INSERT INTO gs1_unit_scan_logs (
				unit_id, ip_address, user_agent, city, region, country, is_repeat,
				device_type, os_name, os_version, browser_name, browser_version
			)
			VALUES ($1, $2::inet, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`, unitID, nullIfEmpty(ip), ua, city, region, country, scanCount > 1,
			nullIfEmpty(deviceType), nullIfEmpty(osName), nullIfEmpty(osVersion),
			nullIfEmpty(browserName), nullIfEmpty(browserVersion))
		if err != nil {
			log.Printf("gs1 scan log insert: %v", err)
		}
	}()

	resp := gs1VerifyResp{
		Valid:           true,
		GTIN:            gtin,
		Lot:             lot,
		Serial:          serial,
		ManufactureDate: manufactureDate.Format("2006-01-02"),
		ScanCount:       scanCount,
		IsFirstScan:     scanCount == 1,
		FirstScanCity:   firstScanCity,
	}
	if expiryDate != nil {
		resp.ExpiryDate = expiryDate.Format("2006-01-02")
	}
	if productName != nil {
		resp.ProductName = *productName
	}
	if productCode != nil {
		resp.ProductCode = *productCode
	}
	if spec != nil {
		resp.Spec = *spec
	}
	if unit != nil {
		resp.Unit = *unit
	}
	if manufacturer != nil {
		resp.Manufacturer = *manufacturer
	}
	if originCountry != nil {
		resp.OriginCountry = *originCountry
	}
	if firstScannedAt != nil {
		s := firstScannedAt.Format(time.RFC3339)
		resp.FirstScannedAt = &s
	}
	if status == "flagged" || status == "disabled" {
		resp.Warning = "This code has been flagged as suspicious. Please contact the manufacturer to verify."
	}
	return c.JSON(resp)
}
