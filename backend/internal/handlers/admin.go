package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

type AdminHandler struct {
	DB            *pgxpool.Pool
	Tokens        *services.TokenService
	PublicBaseURL string
}

type createBatchReq struct {
	BatchCode       string `json:"batch_code"`
	ProductID       int64  `json:"product_id"`
	ProductName     string `json:"product_name"` // legacy — ignored if ProductID > 0
	Quantity        int    `json:"quantity"`
	Notes           string `json:"notes"`
	ManufactureDate string `json:"manufacture_date"` // "YYYY-MM-DD", used by the GS1 DataMatrix module (AI 11)
	ExpiryDate      string `json:"expiry_date"`      // "YYYY-MM-DD", optional (AI 17)
}

type createBatchResp struct {
	BatchID   int64  `json:"batch_id"`
	BatchCode string `json:"batch_code"`
	Generated int    `json:"generated"`
	SampleURL string `json:"sample_url"`
}

// CreateBatch generates N unique QR tokens and inserts them under a new batch.
func (h *AdminHandler) CreateBatch(c *fiber.Ctx) error {
	var req createBatchReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.BatchCode == "" || req.Quantity <= 0 || req.Quantity > 1000000 {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_params"})
	}
	// Product is now OPTIONAL — batches can be created empty, tokens assigned to products later via range assignment.

	ctx, cancel := context.WithTimeout(c.Context(), 300*time.Second)
	defer cancel()

	// If product_id given, resolve name for denorm (legacy support)
	productName := req.ProductName
	if req.ProductID > 0 {
		var name string
		var active bool
		err := h.DB.QueryRow(ctx, `SELECT name, is_active FROM products WHERE id=$1`, req.ProductID).Scan(&name, &active)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "product_not_found"})
		}
		if !active {
			return c.Status(400).JSON(fiber.Map{"error": "product_inactive"})
		}
		productName = name
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_begin"})
	}
	defer tx.Rollback(ctx)

	var batchID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO batches (batch_code, product_id, product_name, total_qty, notes, manufacture_date, expiry_date)
		VALUES ($1, NULLIF($2, 0)::BIGINT, NULLIF($3, ''), $4, $5, NULLIF($6, '')::DATE, NULLIF($7, '')::DATE) RETURNING id
	`, req.BatchCode, req.ProductID, productName, req.Quantity, req.Notes, req.ManufactureDate, req.ExpiryDate).Scan(&batchID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	// Generate codes + assign serial_no + inherit product_id from batch if provided
	codes := make([]string, 0, req.Quantity)
	securityCodes := make([]string, 0, req.Quantity)
	sample := ""
	for i := 0; i < req.Quantity; i++ {
		code, err := h.Tokens.Generate()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "gen_token"})
		}
		secCode, err := services.GenerateSecurityCode()
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "gen_security_code"})
		}
		if sample == "" {
			sample = code
		}
		codes = append(codes, code)
		securityCodes = append(securityCodes, secCode)
	}

	rows := make([][]any, len(codes))
	var pid any
	if req.ProductID > 0 {
		pid = req.ProductID
	}
	for i, code := range codes {
		// batch_id, secret_code, security_code, status, serial_no, product_id, is_ready
		rows[i] = []any{batchID, code, securityCodes[i], "pending", i + 1, pid, req.ProductID > 0}
	}
	_, err = tx.CopyFrom(ctx,
		pgx.Identifier{"qr_tokens"},
		[]string{"batch_id", "secret_code", "security_code", "status", "serial_no", "product_id", "is_ready"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		log.Printf("copy tokens: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "insert_tokens"})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_commit"})
	}

	return c.JSON(createBatchResp{
		BatchID:   batchID,
		BatchCode: req.BatchCode,
		Generated: req.Quantity,
		SampleURL: fmt.Sprintf("%s/v/%s", h.PublicBaseURL, sample),
	})
}

// ExportBatchCSV returns a CSV of secret_code + full_url for a batch.
func (h *AdminHandler) ExportBatchCSV(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 60*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `SELECT secret_code FROM qr_tokens WHERE batch_id=$1 ORDER BY id`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	var buf bytes.Buffer
	cw := csv.NewWriter(&buf)
	cw.Write([]string{"secret_code", "full_url"})
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err == nil {
			cw.Write([]string{code, fmt.Sprintf("%s/v/%s", h.PublicBaseURL, code)})
		}
	}
	cw.Flush()

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="batch_%d.csv"`, id))
	return c.Send(buf.Bytes())
}

// ListBatches returns all batches with counts.
func (h *AdminHandler) ListBatches(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.DB.Query(ctx, `
		SELECT b.id, b.batch_code, COALESCE(b.product_name, '') AS product_name,
		       b.total_qty, b.created_at,
		       COALESCE(SUM(CASE WHEN t.is_activated THEN 1 ELSE 0 END), 0) AS activated,
		       COALESCE(SUM(t.scan_count), 0) AS total_scans,
		       COUNT(t.id) FILTER (WHERE t.product_id IS NOT NULL) AS assigned_tokens
		FROM batches b
		LEFT JOIN qr_tokens t ON t.batch_id = b.id
		GROUP BY b.id ORDER BY b.id DESC
	`)
	if err != nil {
		log.Printf("list batches query: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type row struct {
		ID             int64     `json:"id"`
		BatchCode      string    `json:"batch_code"`
		ProductName    string    `json:"product_name"`
		TotalQty       int       `json:"total_qty"`
		Activated      int       `json:"activated"`
		TotalScans     int       `json:"total_scans"`
		AssignedTokens int       `json:"assigned_tokens"`
		CreatedAt      time.Time `json:"created_at"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ID, &r.BatchCode, &r.ProductName, &r.TotalQty,
			&r.CreatedAt, &r.Activated, &r.TotalScans, &r.AssignedTokens); err != nil {
			log.Printf("scan batch row: %v", err)
			continue
		}
		out = append(out, r)
	}
	return c.JSON(out)
}

// GetTokenTrace returns full lineage of a single token for admin lookup.
func (h *AdminHandler) GetTokenTrace(c *fiber.Ctx) error {
	code := c.Params("code")
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var (
		id             int64
		batchCode      string
		productName    string
		status         string
		scanCount      int
		isActivated    bool
		activatedPhone *string
		voucher        *string
		activatedAt    *time.Time
		firstScannedAt *time.Time
		firstScanCity  *string
		distributor    *string
	)
	err := h.DB.QueryRow(ctx, `
		SELECT t.id, b.batch_code, b.product_name, t.status, t.scan_count,
		       t.is_activated, t.activated_phone, t.activated_voucher, t.activated_at,
		       t.first_scanned_at, t.first_scan_city, d.distributor_name
		FROM qr_tokens t
		JOIN batches b ON b.id = t.batch_id
		LEFT JOIN distributor_boxes d ON d.id = t.distributor_box_id
		WHERE t.secret_code = $1
	`, code).Scan(&id, &batchCode, &productName, &status, &scanCount,
		&isActivated, &activatedPhone, &voucher, &activatedAt,
		&firstScannedAt, &firstScanCity, &distributor)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	logRows, _ := h.DB.Query(ctx, `
		SELECT COALESCE(ip_address::text,''), COALESCE(user_agent,''), COALESCE(city,''), scanned_at
		FROM scan_logs WHERE token_id=$1 ORDER BY scanned_at DESC LIMIT 20
	`, id)
	defer logRows.Close()

	type scanLog struct {
		IP        string    `json:"ip"`
		UserAgent string    `json:"user_agent"`
		City      string    `json:"city"`
		At        time.Time `json:"at"`
	}
	logs := []scanLog{}
	for logRows.Next() {
		var l scanLog
		if err := logRows.Scan(&l.IP, &l.UserAgent, &l.City, &l.At); err == nil {
			logs = append(logs, l)
		}
	}

	return c.JSON(fiber.Map{
		"secret_code":      code,
		"batch_code":       batchCode,
		"product_name":     productName,
		"status":           status,
		"scan_count":       scanCount,
		"is_activated":     isActivated,
		"activated_phone":  activatedPhone,
		"voucher":          voucher,
		"activated_at":     activatedAt,
		"first_scanned_at": firstScannedAt,
		"first_scan_city":  firstScanCity,
		"distributor":      distributor,
		"recent_scans":     logs,
	})
}
