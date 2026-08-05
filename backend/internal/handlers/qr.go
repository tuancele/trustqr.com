package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

type QRHandler struct {
	DB     *pgxpool.Pool
	Redis  *redis.Client
	Tokens *services.TokenService
	Geo    *services.GeoLookup
}

type verifyReq struct {
	Code     string   `json:"code"`
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
	Accuracy *float64 `json:"accuracy"`
}

type verifyResp struct {
	Valid           bool    `json:"valid"`
	NeedsActivation bool    `json:"needs_activation,omitempty"` // token chưa được gán product/chưa active
	ProductID       *int64  `json:"product_id,omitempty"`
	ProductName     string  `json:"product_name,omitempty"`
	CompanyID       *int64  `json:"company_id,omitempty"`
	CompanyName     string  `json:"company_name,omitempty"`
	DistributorID   *int64  `json:"distributor_id,omitempty"`
	DistributorName string  `json:"distributor_name,omitempty"`
	BatchCode       string  `json:"batch_code,omitempty"`
	SerialNo        int     `json:"serial_no,omitempty"`
	ScanCount       int     `json:"scan_count"`
	IsFirstScan     bool    `json:"is_first_scan"`
	IsReady         bool    `json:"is_ready"`
	IsActivated     bool    `json:"is_activated"`
	FirstScannedAt  *string `json:"first_scanned_at,omitempty"`
	FirstScanCity   string  `json:"first_scan_city,omitempty"`
	Status          string  `json:"status,omitempty"`
	Warning         string  `json:"warning,omitempty"`
	Voucher         string  `json:"voucher,omitempty"`
	SecurityCode    string  `json:"security_code,omitempty"`
}

func (h *QRHandler) Verify(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")

	var req verifyReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	// Offline HMAC check FIRST - reject invalid tokens without touching DB
	if !h.Tokens.Verify(req.Code) {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_code"})
	}

	ip := middleware.ClientIP(c)
	ua := c.Get("User-Agent")
	city, region, country := h.Geo.Lookup(ip)

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	// Conditional increment: only count scans when token is READY (assigned to product or explicitly ready).
	// Tokens still in "warehouse" state (unassigned) return info without polluting scan_count/first_scanned_at.
	var (
		tokenID        int64
		batchID        int64
		serialNo       int
		scanCount      int
		firstScannedAt *time.Time
		firstScanCity  string
		isActivated    bool
		isReady        bool
		voucher        *string
		status         string
		tokenProductID *int64
		tokenDistID    *int64
		securityCode   *string
	)
	err := h.DB.QueryRow(ctx, `
		UPDATE qr_tokens
		SET scan_count = scan_count + CASE WHEN (is_ready OR product_id IS NOT NULL) THEN 1 ELSE 0 END,
		    first_scanned_at = CASE
		      WHEN (is_ready OR product_id IS NOT NULL) THEN COALESCE(first_scanned_at, NOW())
		      ELSE first_scanned_at
		    END,
		    first_scan_city = CASE
		      WHEN (is_ready OR product_id IS NOT NULL) THEN COALESCE(first_scan_city, $2)
		      ELSE first_scan_city
		    END,
		    first_scan_ip = CASE
		      WHEN (is_ready OR product_id IS NOT NULL) THEN COALESCE(first_scan_ip, $3::inet)
		      ELSE first_scan_ip
		    END
		WHERE secret_code = $1
		RETURNING id, batch_id, COALESCE(serial_no,0), scan_count, first_scanned_at,
		          COALESCE(first_scan_city,''), is_activated, is_ready, activated_voucher, status,
		          product_id, distributor_id, security_code
	`, req.Code, city, nullIfEmpty(ip)).Scan(&tokenID, &batchID, &serialNo, &scanCount, &firstScannedAt,
		&firstScanCity, &isActivated, &isReady, &voucher, &status, &tokenProductID, &tokenDistID, &securityCode)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "code_not_issued"})
		}
		log.Printf("verify db error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}

	// Skip scan_logs INSERT when token is not ready — those are "curious clicks" pre-activation.
	tokenIsReady := isReady || tokenProductID != nil
	if tokenIsReady {
		go func() {
			bg, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, err := h.DB.Exec(bg, `
				INSERT INTO scan_logs (token_id, ip_address, user_agent, city, region, country, is_repeat, device_lat, device_lng, device_accuracy)
				VALUES ($1, $2::inet, $3, $4, $5, $6, $7, $8, $9, $10)
			`, tokenID, nullIfEmpty(ip), ua, city, region, country, scanCount > 1, req.Lat, req.Lng, req.Accuracy)
			if err != nil {
				log.Printf("scan log insert: %v", err)
			}
		}()
	}

	// Fetch batch info
	var (
		batchCode        string
		batchProductID   *int64
		batchProductName *string
	)
	_ = h.DB.QueryRow(ctx, `SELECT batch_code, product_id, product_name FROM batches WHERE id=$1`, batchID).
		Scan(&batchCode, &batchProductID, &batchProductName)

	// Effective product = token.product_id ?? batch.product_id
	effectiveProductID := tokenProductID
	if effectiveProductID == nil {
		effectiveProductID = batchProductID
	}

	// EARLY RETURN: token chưa gán sản phẩm và chưa ready → hiển thị "chưa kích hoạt"
	if !tokenIsReady && effectiveProductID == nil {
		return c.JSON(verifyResp{
			Valid:           true,
			NeedsActivation: true,
			BatchCode:       batchCode,
			SerialNo:        serialNo,
			ScanCount:       scanCount, // sẽ là 0
			Warning:         "Mã QR này chưa được kích hoạt. Sản phẩm có thể chưa xuất kho hoặc chưa được gán vào hệ thống. Vui lòng liên hệ nhà phân phối.",
		})
	}

	// Legacy tokens created before security_code existed — generate + persist on first scan.
	if securityCode == nil {
		if sc, genErr := services.GenerateSecurityCode(); genErr == nil {
			if _, updErr := h.DB.Exec(ctx, `UPDATE qr_tokens SET security_code=$1 WHERE id=$2`, sc, tokenID); updErr == nil {
				securityCode = &sc
			}
		}
	}

	// Fetch product/company/distributor info for ready tokens
	var (
		productName     string
		companyID       *int64
		companyName     string
		distributorName string
	)
	if effectiveProductID != nil {
		_ = h.DB.QueryRow(ctx, `
			SELECT p.name, p.company_id, COALESCE(c.name, '')
			FROM products p LEFT JOIN companies c ON c.id = p.company_id
			WHERE p.id = $1
		`, *effectiveProductID).Scan(&productName, &companyID, &companyName)
	} else if batchProductName != nil {
		productName = *batchProductName
	}
	if tokenDistID != nil {
		_ = h.DB.QueryRow(ctx, `SELECT name FROM distributors WHERE id=$1`, *tokenDistID).Scan(&distributorName)
	}

	resp := verifyResp{
		Valid:           true,
		ProductID:       effectiveProductID,
		ProductName:     productName,
		CompanyID:       companyID,
		CompanyName:     companyName,
		DistributorID:   tokenDistID,
		DistributorName: distributorName,
		BatchCode:       batchCode,
		SerialNo:        serialNo,
		ScanCount:       scanCount,
		IsFirstScan:     scanCount == 1,
		IsReady:         isReady,
		IsActivated:     isActivated,
		FirstScanCity:   firstScanCity,
		Status:          status,
	}
	if securityCode != nil {
		resp.SecurityCode = *securityCode
	}
	if firstScannedAt != nil {
		s := firstScannedAt.Format(time.RFC3339)
		resp.FirstScannedAt = &s
	}
	if voucher != nil {
		resp.Voucher = *voucher
	}
	if scanCount > 1 {
		resp.Warning = "Mã QR này đã được quét trước đó. Có thể là hàng nhái sao chép tem."
	}
	if status == "flagged" || status == "disabled" {
		resp.Warning = "Mã này đã bị đánh dấu nghi ngờ. Vui lòng liên hệ nhà sản xuất để xác minh."
	}
	return c.JSON(resp)
}

type activateReq struct {
	Code             string `json:"code"`
	Phone            string `json:"phone"`
	MarketingConsent bool   `json:"marketing_consent"`
	PrivacyPolicyVer string `json:"privacy_policy_version"`
}

type activateResp struct {
	Success bool   `json:"success"`
	Voucher string `json:"voucher"`
	Message string `json:"message,omitempty"`
}

func (h *QRHandler) Activate(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")

	var req activateReq
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

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	// Per-phone rate limit: max 3 activations per day
	phoneKey := fmt.Sprintf("rl:activate_phone:%s", phone)
	if h.Redis != nil {
		count, err := h.Redis.Incr(ctx, phoneKey).Result()
		if err == nil {
			if count == 1 {
				h.Redis.Expire(ctx, phoneKey, 24*time.Hour)
			}
			if count > 3 {
				return c.Status(429).JSON(fiber.Map{"error": "phone_rate_limit", "message": "SĐT này đã kích hoạt quá nhiều lần trong 24h."})
			}
		}
	}

	// Generate voucher up-front (only used if this is first activation)
	newVoucher, err := services.GenerateVoucher()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "voucher_gen_failed"})
	}

	// Atomic activate: only sets fields if not yet activated
	var (
		activatedPhone   string
		activatedVoucher string
		wasNew           bool
	)
	err = h.DB.QueryRow(ctx, `
		WITH updated AS (
			UPDATE qr_tokens
			SET is_activated = TRUE,
			    activated_phone = $2,
			    activated_voucher = $3,
			    activated_at = NOW(),
			    status = CASE WHEN status = 'pending' THEN 'activated' ELSE status END
			WHERE secret_code = $1 AND is_activated = FALSE
			RETURNING activated_phone, activated_voucher, TRUE AS was_new
		)
		SELECT activated_phone, activated_voucher, was_new FROM updated
		UNION ALL
		SELECT activated_phone, activated_voucher, FALSE
		FROM qr_tokens
		WHERE secret_code = $1 AND NOT EXISTS(SELECT 1 FROM updated)
		LIMIT 1
	`, req.Code, phone, newVoucher).Scan(&activatedPhone, &activatedVoucher, &wasNew)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "code_not_issued"})
		}
		log.Printf("activate error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}

	// Upsert customer_leads.
	// Khách chỉ nhập SĐT; tên/địa chỉ do admin bổ sung thủ công ở trang quản lý khách hàng.
	if wasNew {
		city, _, _ := h.Geo.Lookup(middleware.ClientIP(c))
		_, err = h.DB.Exec(ctx, `
			INSERT INTO customer_leads
				(phone, city, marketing_consent, marketing_consent_at, privacy_policy_version)
			VALUES ($1, NULLIF($4,''), $2, CASE WHEN $2 THEN NOW() ELSE NULL END, $3)
			ON CONFLICT (phone) DO UPDATE
			SET total_activated_products = customer_leads.total_activated_products + 1,
			    last_activated_at = NOW(),
			    city      = COALESCE(customer_leads.city, EXCLUDED.city),
			    marketing_consent = customer_leads.marketing_consent OR EXCLUDED.marketing_consent,
			    marketing_consent_at = COALESCE(customer_leads.marketing_consent_at, EXCLUDED.marketing_consent_at)
		`, phone, req.MarketingConsent, req.PrivacyPolicyVer, city)
		if err != nil {
			log.Printf("upsert lead: %v", err)
		}
	}

	msg := "Kích hoạt thành công! Cảm ơn bạn đã tin dùng sản phẩm chính hãng."
	if !wasNew {
		msg = "Mã này đã được kích hoạt trước đó. Đây là voucher của bạn."
	}
	return c.JSON(activateResp{
		Success: true,
		Voucher: activatedVoucher,
		Message: msg,
	})
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
