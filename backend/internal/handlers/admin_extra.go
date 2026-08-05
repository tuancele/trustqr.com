package handlers

import (
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

type AdminExtraHandler struct {
	DB    *pgxpool.Pool
	Audit *services.AuditLogger
}

// -------- Box assignment --------

type assignBoxReq struct {
	BoxCode          string   `json:"box_code"`
	BatchID          int64    `json:"batch_id"`
	DistributorName  string   `json:"distributor_name"`
	DistributorPhone string   `json:"distributor_phone"`
	DistributorAddr  string   `json:"distributor_addr"`
	TokenCodes       []string `json:"token_codes"`
	Notes            string   `json:"notes"`
}

func (h *AdminExtraHandler) AssignBox(c *fiber.Ctx) error {
	var req assignBoxReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.BoxCode == "" || req.BatchID == 0 || req.DistributorName == "" || len(req.TokenCodes) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_params"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 30*time.Second)
	defer cancel()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_begin"})
	}
	defer tx.Rollback(ctx)

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	var boxID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO distributor_boxes
			(box_code, batch_id, distributor_name, distributor_phone, distributor_addr, total_tokens, assigned_by, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
	`, req.BoxCode, req.BatchID, req.DistributorName, req.DistributorPhone,
		req.DistributorAddr, len(req.TokenCodes), nullIfZeroInt64(adminID), req.Notes).Scan(&boxID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	// Update tokens in one query
	tag, err := tx.Exec(ctx, `
		UPDATE qr_tokens SET distributor_box_id = $1
		WHERE batch_id = $2 AND secret_code = ANY($3)
	`, boxID, req.BatchID, req.TokenCodes)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "update_tokens"})
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_commit"})
	}

	h.Audit.Log(adminID, "box.assign", "box", req.BoxCode, req, middleware.ClientIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"box_id":         boxID,
		"tokens_updated": tag.RowsAffected(),
	})
}

// -------- Token disable --------

func (h *AdminExtraHandler) DisableToken(c *fiber.Ctx) error {
	id := c.Params("id")
	tokenID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `UPDATE qr_tokens SET status='disabled' WHERE id=$1`, tokenID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "token.disable", "token", id, nil, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"disabled": true})
}

// -------- Analytics: fraud tokens --------

func (h *AdminExtraHandler) FraudList(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT t.id, t.secret_code, t.scan_count, t.status,
		       t.first_scanned_at, t.first_scan_city,
		       COUNT(DISTINCT s.ip_address) FILTER (WHERE s.scanned_at > NOW() - INTERVAL '30 days') AS unique_ips,
		       COUNT(DISTINCT s.city)       FILTER (WHERE s.scanned_at > NOW() - INTERVAL '30 days') AS unique_cities,
		       b.batch_code, b.product_name
		FROM qr_tokens t
		JOIN batches b ON b.id = t.batch_id
		LEFT JOIN scan_logs s ON s.token_id = t.id
		WHERE t.scan_count > 3 OR t.status IN ('flagged','disabled')
		GROUP BY t.id, b.batch_code, b.product_name
		ORDER BY t.scan_count DESC
		LIMIT 200
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID             int64      `json:"id"`
		SecretCode     string     `json:"secret_code"`
		ScanCount      int        `json:"scan_count"`
		Status         string     `json:"status"`
		FirstScannedAt *time.Time `json:"first_scanned_at"`
		FirstScanCity  *string    `json:"first_scan_city"`
		UniqueIPs      int        `json:"unique_ips"`
		UniqueCities   int        `json:"unique_cities"`
		BatchCode      string     `json:"batch_code"`
		ProductName    string     `json:"product_name"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.SecretCode, &r.ScanCount, &r.Status,
			&r.FirstScannedAt, &r.FirstScanCity, &r.UniqueIPs, &r.UniqueCities,
			&r.BatchCode, &r.ProductName); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// -------- Analytics: geo distribution --------

func (h *AdminExtraHandler) GeoAnalytics(c *fiber.Ctx) error {
	days := 30
	if d := c.Query("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(city,'Unknown') AS city, COUNT(*) AS scans, COUNT(DISTINCT token_id) AS unique_tokens
		FROM scan_logs
		WHERE scanned_at > NOW() - make_interval(days => $1)
		GROUP BY city
		ORDER BY scans DESC
		LIMIT 100
	`, days)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		City         string `json:"city"`
		Scans        int    `json:"scans"`
		UniqueTokens int    `json:"unique_tokens"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.City, &r.Scans, &r.UniqueTokens); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(fiber.Map{"days": days, "data": out})
}

// -------- Analytics: scan trend --------

func (h *AdminExtraHandler) ScanTrend(c *fiber.Ctx) error {
	days := 30
	if d := c.Query("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT DATE(scanned_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
		       COUNT(*) AS scans, COUNT(DISTINCT token_id) AS unique_tokens
		FROM scan_logs
		WHERE scanned_at > NOW() - make_interval(days => $1)
		GROUP BY 1
		ORDER BY 1 ASC
	`, days)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		Day          string `json:"day"`
		Scans        int    `json:"scans"`
		UniqueTokens int    `json:"unique_tokens"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		var day time.Time
		if err := rows.Scan(&day, &r.Scans, &r.UniqueTokens); err == nil {
			r.Day = day.Format("2006-01-02")
			out = append(out, r)
		}
	}
	return c.JSON(fiber.Map{"days": days, "data": out})
}

// -------- Analytics: device/OS/browser breakdown --------

func (h *AdminExtraHandler) DeviceBreakdown(c *fiber.Ctx) error {
	days := 30
	if d := c.Query("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT 'device' AS kind, COALESCE(device_type,'Không xác định') AS label, COUNT(*) AS count
		FROM scan_logs
		WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
		GROUP BY 2
		UNION ALL
		SELECT 'os', COALESCE(os_name,'Không xác định'), COUNT(*)
		FROM scan_logs
		WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
		GROUP BY 2
		UNION ALL
		SELECT 'browser', COALESCE(browser_name,'Không xác định'), COUNT(*)
		FROM scan_logs
		WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
		GROUP BY 2
		ORDER BY 1, 3 DESC
	`, days)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type item struct {
		Label string `json:"label"`
		Count int    `json:"count"`
	}
	devices := []item{}
	oses := []item{}
	browsers := []item{}
	for rows.Next() {
		var kind string
		var it item
		if err := rows.Scan(&kind, &it.Label, &it.Count); err != nil {
			continue
		}
		switch kind {
		case "device":
			devices = append(devices, it)
		case "os":
			oses = append(oses, it)
		case "browser":
			browsers = append(browsers, it)
		}
	}
	return c.JSON(fiber.Map{"days": days, "devices": devices, "os": oses, "browsers": browsers})
}

// -------- Analytics: summary --------

func (h *AdminExtraHandler) Summary(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var totalTokens, activated, totalScans, todayScans, uniquePhones, flagged int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM qr_tokens),
		  (SELECT COUNT(*) FROM qr_tokens WHERE is_activated),
		  (SELECT COALESCE(SUM(scan_count),0) FROM qr_tokens),
		  (SELECT COUNT(*) FROM scan_logs WHERE scanned_at > NOW() - INTERVAL '24 hours'),
		  (SELECT COUNT(*) FROM customer_leads),
		  (SELECT COUNT(*) FROM qr_tokens WHERE status='flagged')
	`).Scan(&totalTokens, &activated, &totalScans, &todayScans, &uniquePhones, &flagged)

	return c.JSON(fiber.Map{
		"total_tokens":       totalTokens,
		"activated_tokens":   activated,
		"total_scans":        totalScans,
		"scans_last_24h":     todayScans,
		"unique_customers":   uniquePhones,
		"flagged_tokens":     flagged,
	})
}

// -------- Audit log list --------

func (h *AdminExtraHandler) AuditList(c *fiber.Ctx) error {
	limit := 100
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT a.id, a.admin_id, u.email, a.action, a.target_type, a.target_id,
		       COALESCE(a.ip_address::text,''), COALESCE(a.user_agent,''), a.created_at
		FROM audit_logs a
		LEFT JOIN admin_users u ON u.id = a.admin_id
		ORDER BY a.id DESC LIMIT $1
	`, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID         int64     `json:"id"`
		AdminID    *int64    `json:"admin_id"`
		Email      *string   `json:"email"`
		Action     string    `json:"action"`
		TargetType *string   `json:"target_type"`
		TargetID   *string   `json:"target_id"`
		IP         string    `json:"ip"`
		UA         string    `json:"user_agent"`
		At         time.Time `json:"at"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.AdminID, &r.Email, &r.Action, &r.TargetType, &r.TargetID, &r.IP, &r.UA, &r.At); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func nullIfZeroInt64(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}
