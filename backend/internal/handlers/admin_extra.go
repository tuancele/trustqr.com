package handlers

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
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

// -------- GS1 unit disable (parity with QR token disable) --------

func (h *AdminExtraHandler) DisableGS1Unit(c *fiber.Ctx) error {
	id := c.Params("id")
	unitID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `UPDATE gs1_label_units SET status='disabled' WHERE id=$1`, unitID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "gs1_unit.disable", "gs1_unit", id, nil, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"disabled": true})
}

// -------- Analytics: fraud tokens --------

func (h *AdminExtraHandler) FraudList(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	qrLimit := getScanLimit(ctx, h.DB, "qr")
	gs1Limit := getScanLimit(ctx, h.DB, "gs1")

	rows, err := h.DB.Query(ctx, `
		SELECT 'qr' AS source, t.id, t.secret_code, t.scan_count, t.status,
		       t.first_scanned_at, t.first_scan_city,
		       COUNT(DISTINCT s.ip_address) FILTER (WHERE s.scanned_at > NOW() - INTERVAL '30 days') AS unique_ips,
		       COUNT(DISTINCT s.city)       FILTER (WHERE s.scanned_at > NOW() - INTERVAL '30 days') AS unique_cities,
		       b.batch_code, b.product_name,
		       COALESCE(t.product_id, b.product_id) AS product_id, NULL::varchar AS gtin, NULL::bigint AS label_id,
		       (t.scan_count > $1::int) AS locked
		FROM qr_tokens t
		JOIN batches b ON b.id = t.batch_id
		LEFT JOIN scan_logs s ON s.token_id = t.id
		WHERE t.scan_count > 3 OR t.status IN ('flagged','disabled') OR t.scan_count > $1::int
		GROUP BY t.id, b.batch_code, b.product_name, b.product_id
		UNION ALL
		SELECT 'gs1' AS source, u.id, u.verify_code, u.scan_count, u.status,
		       u.first_scanned_at, u.first_scan_city,
		       COUNT(DISTINCT g.ip_address) FILTER (WHERE g.scanned_at > NOW() - INTERVAL '30 days') AS unique_ips,
		       COUNT(DISTINCT g.city)       FILTER (WHERE g.scanned_at > NOW() - INTERVAL '30 days') AS unique_cities,
		       gl.lot, COALESCE(gl.product_name,''),
		       NULL::bigint AS product_id, gl.gtin, gl.id AS label_id,
		       (u.scan_count > $2::int) AS locked
		FROM gs1_label_units u
		JOIN gs1_labels gl ON gl.id = u.label_id
		LEFT JOIN gs1_unit_scan_logs g ON g.unit_id = u.id
		WHERE u.scan_count > 3 OR u.status IN ('flagged','disabled') OR u.scan_count > $2::int
		GROUP BY u.id, gl.lot, gl.product_name, gl.gtin, gl.id
		ORDER BY scan_count DESC
		LIMIT 200
	`, qrLimit, gs1Limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		Source         string     `json:"source"`
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
		ProductID      *int64     `json:"product_id"`
		Gtin           *string    `json:"gtin"`
		LabelID        *int64     `json:"label_id"`
		Locked         bool       `json:"locked"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Source, &r.ID, &r.SecretCode, &r.ScanCount, &r.Status,
			&r.FirstScannedAt, &r.FirstScanCity, &r.UniqueIPs, &r.UniqueCities,
			&r.BatchCode, &r.ProductName, &r.ProductID, &r.Gtin, &r.LabelID, &r.Locked); err == nil {
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
		SELECT city, SUM(scans) AS scans, SUM(unique_tokens) AS unique_tokens
		FROM (
			SELECT COALESCE(city,'Unknown') AS city, COUNT(*) AS scans, COUNT(DISTINCT token_id) AS unique_tokens
			FROM scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1)
			GROUP BY city
			UNION ALL
			SELECT COALESCE(city,'Unknown') AS city, COUNT(*) AS scans, COUNT(DISTINCT unit_id) AS unique_tokens
			FROM gs1_unit_scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1)
			GROUP BY city
		) x
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
		SELECT day, SUM(scans) AS scans, SUM(unique_tokens) AS unique_tokens
		FROM (
			SELECT DATE(scanned_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
			       COUNT(*) AS scans, COUNT(DISTINCT token_id) AS unique_tokens
			FROM scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1)
			GROUP BY 1
			UNION ALL
			SELECT DATE(scanned_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
			       COUNT(*) AS scans, COUNT(DISTINCT unit_id) AS unique_tokens
			FROM gs1_unit_scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1)
			GROUP BY 1
		) x
		GROUP BY day
		ORDER BY day ASC
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
		SELECT kind, label, SUM(count) AS count
		FROM (
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
			UNION ALL
			SELECT 'device', COALESCE(device_type,'Không xác định'), COUNT(*)
			FROM gs1_unit_scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
			GROUP BY 2
			UNION ALL
			SELECT 'os', COALESCE(os_name,'Không xác định'), COUNT(*)
			FROM gs1_unit_scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
			GROUP BY 2
			UNION ALL
			SELECT 'browser', COALESCE(browser_name,'Không xác định'), COUNT(*)
			FROM gs1_unit_scan_logs
			WHERE scanned_at > NOW() - make_interval(days => $1) AND (device_type IS NULL OR device_type <> 'bot')
			GROUP BY 2
		) x
		GROUP BY kind, label
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

// -------- Analytics: raw scan log (per-scan detail) --------

func (h *AdminExtraHandler) ScanLog(c *fiber.Ctx) error {
	days := 30
	if d := c.Query("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}
	page := 1
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(c.Query("page_size")); err == nil && ps > 0 && ps <= 200 {
		pageSize = ps
	}
	q := strings.TrimSpace(c.Query("q"))

	ctx, cancel := context.WithTimeout(c.Context(), 15*time.Second)
	defer cancel()

	base := `
		SELECT sl.id, sl.scanned_at, sl.is_repeat, 'qr'::text AS source,
		       t.secret_code AS code, b.batch_code AS batch_code, COALESCE(b.product_name,'') AS product_name,
		       COALESCE(sl.city,'') AS city, COALESCE(sl.region,'') AS region, COALESCE(sl.country,'') AS country,
		       COALESCE(sl.device_type,'') AS device_type, COALESCE(sl.os_name,'') AS os_name, COALESCE(sl.os_version,'') AS os_version,
		       COALESCE(sl.browser_name,'') AS browser_name, COALESCE(sl.browser_version,'') AS browser_version,
		       COALESCE(sl.ip_address::text,'') AS ip, sl.device_lat AS lat, sl.device_lng AS lng,
		       COALESCE(sl.visitor_id,'') AS visitor_id,
		       COALESCE(t.product_id, b.product_id) AS product_id, NULL::varchar AS gtin, NULL::bigint AS label_id
		FROM scan_logs sl
		JOIN qr_tokens t ON t.id = sl.token_id
		JOIN batches b ON b.id = t.batch_id
		WHERE sl.scanned_at > NOW() - make_interval(days => $1)
		UNION ALL
		SELECT g.id, g.scanned_at, g.is_repeat, 'gs1'::text AS source,
		       u.verify_code AS code, gl.lot AS batch_code, COALESCE(gl.product_name,'') AS product_name,
		       COALESCE(g.city,'') AS city, COALESCE(g.region,'') AS region, COALESCE(g.country,'') AS country,
		       COALESCE(g.device_type,'') AS device_type, COALESCE(g.os_name,'') AS os_name, COALESCE(g.os_version,'') AS os_version,
		       COALESCE(g.browser_name,'') AS browser_name, COALESCE(g.browser_version,'') AS browser_version,
		       COALESCE(g.ip_address::text,'') AS ip, NULL::double precision AS lat, NULL::double precision AS lng,
		       '' AS visitor_id,
		       NULL::bigint AS product_id, gl.gtin, gl.id AS label_id
		FROM gs1_unit_scan_logs g
		JOIN gs1_label_units u ON u.id = g.unit_id
		JOIN gs1_labels gl ON gl.id = u.label_id
		WHERE g.scanned_at > NOW() - make_interval(days => $1)
	`
	where := ""
	args := []any{days}
	if q != "" {
		args = append(args, "%"+q+"%")
		where = fmt.Sprintf(` WHERE (code ILIKE $%d OR product_name ILIKE $%d OR batch_code ILIKE $%d OR gtin ILIKE $%d)`, len(args), len(args), len(args), len(args))
	}

	var total int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM (`+base+`) combined`+where, args...).Scan(&total); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "count"})
	}

	args = append(args, pageSize, (page-1)*pageSize)
	rows, err := h.DB.Query(ctx, `SELECT * FROM (`+base+`) combined`+where+fmt.Sprintf(`
		ORDER BY scanned_at DESC
		LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID             int64     `json:"id"`
		ScannedAt      time.Time `json:"scanned_at"`
		IsRepeat       bool      `json:"is_repeat"`
		Source         string    `json:"source"`
		SecretCode     string    `json:"secret_code"`
		BatchCode      string    `json:"batch_code"`
		ProductName    string    `json:"product_name"`
		City           string    `json:"city"`
		Region         string    `json:"region"`
		Country        string    `json:"country"`
		DeviceType     string    `json:"device_type"`
		OSName         string    `json:"os_name"`
		OSVersion      string    `json:"os_version"`
		BrowserName    string    `json:"browser_name"`
		BrowserVersion string    `json:"browser_version"`
		IP             string    `json:"ip"`
		Lat            *float64  `json:"lat"`
		Lng            *float64  `json:"lng"`
		VisitorID      string    `json:"visitor_id"`
		ProductID      *int64    `json:"product_id"`
		Gtin           *string   `json:"gtin"`
		LabelID        *int64    `json:"label_id"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.ScannedAt, &r.IsRepeat, &r.Source, &r.SecretCode, &r.BatchCode, &r.ProductName,
			&r.City, &r.Region, &r.Country, &r.DeviceType, &r.OSName, &r.OSVersion,
			&r.BrowserName, &r.BrowserVersion, &r.IP, &r.Lat, &r.Lng, &r.VisitorID,
			&r.ProductID, &r.Gtin, &r.LabelID); err != nil {
			log.Printf("scan-log row scan: %v", err)
		} else {
			out = append(out, r)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("scan-log rows.Err: %v", err)
	}
	return c.JSON(fiber.Map{"data": out, "total": total, "page": page, "page_size": pageSize})
}

// -------- Analytics: summary --------

func (h *AdminExtraHandler) Summary(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	qrLimit := getScanLimit(ctx, h.DB, "qr")
	gs1Limit := getScanLimit(ctx, h.DB, "gs1")

	var totalTokens, activated, totalScans, todayScans, uniquePhones, flagged int
	var flaggedGS1, disabledQR, disabledGS1, lockedQR, lockedGS1 int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM qr_tokens),
		  (SELECT COUNT(*) FROM qr_tokens WHERE is_activated),
		  (SELECT COALESCE(SUM(scan_count),0) FROM qr_tokens),
		  (SELECT COUNT(*) FROM scan_logs WHERE scanned_at > NOW() - INTERVAL '24 hours'),
		  (SELECT COUNT(*) FROM customer_leads),
		  (SELECT COUNT(*) FROM qr_tokens WHERE status='flagged'),
		  (SELECT COUNT(*) FROM gs1_label_units WHERE status='flagged'),
		  (SELECT COUNT(*) FROM qr_tokens WHERE status='disabled'),
		  (SELECT COUNT(*) FROM gs1_label_units WHERE status='disabled'),
		  (SELECT COUNT(*) FROM qr_tokens WHERE scan_count > $1::int),
		  (SELECT COUNT(*) FROM gs1_label_units WHERE scan_count > $2::int)
	`, qrLimit, gs1Limit).Scan(&totalTokens, &activated, &totalScans, &todayScans, &uniquePhones, &flagged,
		&flaggedGS1, &disabledQR, &disabledGS1, &lockedQR, &lockedGS1)

	return c.JSON(fiber.Map{
		"total_tokens":      totalTokens,
		"activated_tokens":  activated,
		"total_scans":       totalScans,
		"scans_last_24h":    todayScans,
		"unique_customers":  uniquePhones,
		"flagged_tokens":    flagged,
		"fraud_summary": fiber.Map{
			"flagged_qr":     flagged,
			"flagged_gs1":    flaggedGS1,
			"flagged_total":  flagged + flaggedGS1,
			"disabled_qr":    disabledQR,
			"disabled_gs1":   disabledGS1,
			"disabled_total": disabledQR + disabledGS1,
			"locked_qr":      lockedQR,
			"locked_gs1":     lockedGS1,
			"locked_total":   lockedQR + lockedGS1,
		},
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
