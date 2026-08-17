package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
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
	BrandID         *int64  `json:"brand_id,omitempty"`
	BrandName       string  `json:"brand_name,omitempty"`
	BrandWebsite    string  `json:"brand_website,omitempty"`
	BrandLogoURL    string  `json:"brand_logo_url,omitempty"`
	ScanCount       int     `json:"scan_count"`
	IsFirstScan     bool    `json:"is_first_scan"`
	FirstScannedAt  *string `json:"first_scanned_at,omitempty"`
	FirstScanCity   string  `json:"first_scan_city,omitempty"`
	Warning         string  `json:"warning,omitempty"`
	Locked          bool    `json:"locked,omitempty"`
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
		brandID         *int64
		brandName       string
		brandWebsite    string
		brandHasLogo    bool
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
		SELECT gl.gtin, gl.manufacture_date, gl.expiry_date, gl.lot, gl.serial,
		       gl.product_name, gl.product_code, gl.spec, gl.unit, gl.manufacturer, gl.origin_country,
		       gl.brand_id, COALESCE(b.name,''), COALESCE(b.website,''), (b.logo_path IS NOT NULL)
		FROM gs1_labels gl
		LEFT JOIN brands b ON b.id = gl.brand_id
		WHERE gl.id = $1
	`, labelID).Scan(&gtin, &manufactureDate, &expiryDate, &lot, &serial,
		&productName, &productCode, &spec, &unit, &manufacturer, &originCountry,
		&brandID, &brandName, &brandWebsite, &brandHasLogo)
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

	gs1Limit := getScanLimit(ctx, h.DB, "gs1")
	locked := gs1Limit != nil && scanCount > *gs1Limit

	resp := gs1VerifyResp{
		Valid:           true,
		GTIN:            gtin,
		Lot:             lot,
		Serial:          serial,
		ManufactureDate: manufactureDate.Format("2006-01-02"),
		ScanCount:       scanCount,
		IsFirstScan:     scanCount == 1,
		FirstScanCity:   firstScanCity,
		Locked:          locked,
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
	if brandID != nil {
		resp.BrandID = brandID
		resp.BrandName = brandName
		resp.BrandWebsite = brandWebsite
		if brandHasLogo {
			resp.BrandLogoURL = fmt.Sprintf("/api/v1/brands/%d/logo/file", *brandID)
		}
	}
	if firstScannedAt != nil {
		s := firstScannedAt.Format(time.RFC3339)
		resp.FirstScannedAt = &s
	}
	if status == "flagged" || status == "disabled" {
		resp.Warning = "This code has been flagged as suspicious. Please contact the manufacturer to verify."
	}
	if locked {
		resp.Warning = "This code has exceeded the maximum allowed number of scans and has been locked for security reasons. Please contact the manufacturer for assistance."
	}
	return c.JSON(resp)
}

type gs1VoucherReq struct {
	Code             string `json:"code"`
	FullName         string `json:"full_name"`
	Phone            string `json:"phone"`
	MarketingConsent bool   `json:"marketing_consent"`
	PrivacyPolicyVer string `json:"privacy_policy_version"`
}

type gs1VoucherResp struct {
	Success bool   `json:"success"`
	Voucher string `json:"voucher"`
	Message string `json:"message,omitempty"`
}

// RequestVoucher is a lead-capture flow on the GS1 verify page (/auth/:code):
// consumers submit their name/phone to receive a one-time discount voucher,
// mirroring qr.go's Activate but scoped to gs1_label_units.
func (h *GS1VerifyHandler) RequestVoucher(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")

	var req gs1VoucherReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if !h.Tokens.Verify(req.Code) {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_code"})
	}

	phone, err := services.NormalizePhoneVN(req.Phone)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_phone"})
	}
	fullName := strings.TrimSpace(req.FullName)
	if fullName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_name"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	// Per-phone rate limit: max 3 voucher requests per day
	phoneKey := fmt.Sprintf("rl:gs1_voucher_phone:%s", phone)
	if h.Redis != nil {
		count, err := h.Redis.Incr(ctx, phoneKey).Result()
		if err == nil {
			if count == 1 {
				h.Redis.Expire(ctx, phoneKey, 24*time.Hour)
			}
			if count > 3 {
				return c.Status(429).JSON(fiber.Map{"error": "phone_rate_limit", "message": "This phone number has requested too many vouchers in the last 24 hours."})
			}
		}
	}

	// Generate voucher up-front (only used if this is the first request for this unit)
	newVoucher, err := services.GenerateVoucher()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "voucher_gen_failed"})
	}

	// Atomic activate: only sets fields if not yet activated
	var (
		activatedVoucher string
		wasNew           bool
	)
	err = h.DB.QueryRow(ctx, `
		WITH updated AS (
			UPDATE gs1_label_units
			SET is_activated = TRUE,
			    activated_name = $2,
			    activated_phone = $3,
			    activated_voucher = $4,
			    activated_at = NOW()
			WHERE verify_code = $1 AND is_activated = FALSE
			RETURNING activated_voucher, TRUE AS was_new
		)
		SELECT activated_voucher, was_new FROM updated
		UNION ALL
		SELECT activated_voucher, FALSE
		FROM gs1_label_units
		WHERE verify_code = $1 AND NOT EXISTS(SELECT 1 FROM updated)
		LIMIT 1
	`, req.Code, fullName, phone, newVoucher).Scan(&activatedVoucher, &wasNew)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "code_not_issued"})
		}
		log.Printf("gs1 voucher error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}

	if wasNew {
		city, _, _ := h.Geo.Lookup(middleware.ClientIP(c))
		_, err = h.DB.Exec(ctx, `
			INSERT INTO customer_leads
				(phone, full_name, city, marketing_consent, marketing_consent_at, privacy_policy_version)
			VALUES ($1, $2, NULLIF($5,''), $3, CASE WHEN $3 THEN NOW() ELSE NULL END, $4)
			ON CONFLICT (phone) DO UPDATE
			SET full_name = COALESCE(customer_leads.full_name, EXCLUDED.full_name),
			    city      = COALESCE(customer_leads.city, EXCLUDED.city),
			    marketing_consent = customer_leads.marketing_consent OR EXCLUDED.marketing_consent,
			    marketing_consent_at = COALESCE(customer_leads.marketing_consent_at, EXCLUDED.marketing_consent_at)
		`, phone, fullName, req.MarketingConsent, req.PrivacyPolicyVer, city)
		if err != nil {
			log.Printf("upsert gs1 voucher lead: %v", err)
		}
	}

	msg := "Thank you! Here is your exclusive voucher."
	if !wasNew {
		msg = "A voucher has already been claimed for this code. Here it is again."
	}
	return c.JSON(gs1VoucherResp{
		Success: true,
		Voucher: activatedVoucher,
		Message: msg,
	})
}
