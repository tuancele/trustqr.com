package handlers

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"trustqr/backend/internal/middleware"
)

// GetBatchDetail returns batch info + summary + assignment history.
func (h *AdminHandler) GetBatchDetail(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var b struct {
		ID          int64     `json:"id"`
		BatchCode   string    `json:"batch_code"`
		ProductID   *int64    `json:"default_product_id"`
		ProductName *string   `json:"default_product_name"`
		TotalQty    int       `json:"total_qty"`
		Notes       *string   `json:"notes"`
		CreatedAt   time.Time `json:"created_at"`
	}
	err = h.DB.QueryRow(ctx, `
		SELECT id, batch_code, product_id, product_name, total_qty, notes, created_at
		FROM batches WHERE id=$1
	`, id).Scan(&b.ID, &b.BatchCode, &b.ProductID, &b.ProductName, &b.TotalQty, &b.Notes, &b.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	// Token summary
	var assigned, activated, scanned, ready int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE product_id IS NOT NULL),
		  COUNT(*) FILTER (WHERE is_activated),
		  COUNT(*) FILTER (WHERE scan_count > 0),
		  COUNT(*) FILTER (WHERE is_ready)
		FROM qr_tokens WHERE batch_id=$1
	`, id).Scan(&assigned, &activated, &scanned, &ready)

	// Assignment history
	arows, _ := h.DB.Query(ctx, `
		SELECT ta.id, ta.from_serial, ta.to_serial, ta.product_id, p.name,
		       ta.distributor_id, d.name, ta.tokens_updated, ta.notes, ta.assigned_at, u.email
		FROM token_assignments ta
		LEFT JOIN products p     ON p.id = ta.product_id
		LEFT JOIN distributors d ON d.id = ta.distributor_id
		LEFT JOIN admin_users u  ON u.id = ta.assigned_by
		WHERE ta.batch_id = $1
		ORDER BY ta.from_serial ASC
	`, id)
	defer arows.Close()

	type assign struct {
		ID              int64     `json:"id"`
		FromSerial      int       `json:"from_serial"`
		ToSerial        int       `json:"to_serial"`
		ProductID       *int64    `json:"product_id"`
		ProductName     *string   `json:"product_name"`
		DistributorID   *int64    `json:"distributor_id"`
		DistributorName *string   `json:"distributor_name"`
		TokensUpdated   int       `json:"tokens_updated"`
		Notes           *string   `json:"notes"`
		AssignedAt      time.Time `json:"assigned_at"`
		AssignedByEmail *string   `json:"assigned_by_email"`
	}
	assignments := []assign{}
	for arows.Next() {
		var a assign
		if err := arows.Scan(&a.ID, &a.FromSerial, &a.ToSerial, &a.ProductID, &a.ProductName,
			&a.DistributorID, &a.DistributorName, &a.TokensUpdated, &a.Notes, &a.AssignedAt, &a.AssignedByEmail); err == nil {
			assignments = append(assignments, a)
		}
	}

	return c.JSON(fiber.Map{
		"batch": b,
		"summary": fiber.Map{
			"total":     b.TotalQty,
			"assigned":  assigned,
			"unassigned": b.TotalQty - assigned,
			"ready":     ready,
			"activated": activated,
			"scanned":   scanned,
		},
		"assignments": assignments,
	})
}

// UpdateBatch allows editing batch_code, notes (not qty since tokens exist).
type updateBatchReq struct {
	BatchCode string `json:"batch_code"`
	Notes     string `json:"notes"`
}

func (h *AdminHandler) UpdateBatch(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req updateBatchReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.BatchCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "batch_code_required"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `UPDATE batches SET batch_code=$1, notes=$2 WHERE id=$3`,
		req.BatchCode, req.Notes, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ListBatchTokens returns paginated tokens with filters.
func (h *AdminHandler) ListBatchTokens(c *fiber.Ctx) error {
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
	filter := c.Query("filter", "") // "unassigned", "assigned", "activated", "ready", ""
	fromSerial, _ := strconv.Atoi(c.Query("from_serial", "0"))
	toSerial, _ := strconv.Atoi(c.Query("to_serial", "0"))

	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	where := "batch_id = $1"
	args := []any{id}
	argN := 1
	switch filter {
	case "unassigned":
		where += " AND product_id IS NULL"
	case "assigned":
		where += " AND product_id IS NOT NULL"
	case "activated":
		where += " AND is_activated = TRUE"
	case "ready":
		where += " AND is_ready = TRUE"
	}
	if fromSerial > 0 {
		argN++
		where += fmt.Sprintf(" AND serial_no >= $%d", argN)
		args = append(args, fromSerial)
	}
	if toSerial > 0 {
		argN++
		where += fmt.Sprintf(" AND serial_no <= $%d", argN)
		args = append(args, toSerial)
	}

	// Count
	var total int
	_ = h.DB.QueryRow(ctx, "SELECT COUNT(*) FROM qr_tokens WHERE "+where, args...).Scan(&total)

	// Page
	argN++
	limitArg := argN
	args = append(args, pageSize)
	argN++
	offsetArg := argN
	args = append(args, (page-1)*pageSize)

	sql := fmt.Sprintf(`
		SELECT t.id, t.serial_no, t.secret_code, t.status, t.scan_count, t.is_ready, t.is_activated,
		       t.product_id, p.name, t.distributor_id, d.name, t.activated_phone
		FROM qr_tokens t
		LEFT JOIN products p     ON p.id = t.product_id
		LEFT JOIN distributors d ON d.id = t.distributor_id
		WHERE %s
		ORDER BY t.serial_no ASC
		LIMIT $%d OFFSET $%d`, where, limitArg, offsetArg)

	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	type tok struct {
		ID              int64   `json:"id"`
		SerialNo        int     `json:"serial_no"`
		SecretCode      string  `json:"secret_code"`
		Status          string  `json:"status"`
		ScanCount       int     `json:"scan_count"`
		IsReady         bool    `json:"is_ready"`
		IsActivated     bool    `json:"is_activated"`
		ProductID       *int64  `json:"product_id"`
		ProductName     *string `json:"product_name"`
		DistributorID   *int64  `json:"distributor_id"`
		DistributorName *string `json:"distributor_name"`
		ActivatedPhone  *string `json:"activated_phone"`
	}
	out := []tok{}
	for rows.Next() {
		var t tok
		if err := rows.Scan(&t.ID, &t.SerialNo, &t.SecretCode, &t.Status, &t.ScanCount, &t.IsReady, &t.IsActivated,
			&t.ProductID, &t.ProductName, &t.DistributorID, &t.DistributorName, &t.ActivatedPhone); err == nil {
			out = append(out, t)
		}
	}

	return c.JSON(fiber.Map{
		"tokens":    out,
		"page":      page,
		"page_size": pageSize,
		"total":     total,
	})
}

// AssignRange assigns product/distributor to a range of tokens and optionally marks them ready.
type assignRangeReq struct {
	FromSerial    int    `json:"from_serial"`
	ToSerial      int    `json:"to_serial"`
	ProductID     int64  `json:"product_id"`
	DistributorID int64  `json:"distributor_id"`
	MarkReady     bool   `json:"mark_ready"`
	Notes         string `json:"notes"`
}

func (h *AdminHandler) AssignRange(c *fiber.Ctx) error {
	batchID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req assignRangeReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if req.FromSerial < 1 || req.ToSerial < req.FromSerial {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_range"})
	}
	if req.ProductID == 0 && req.DistributorID == 0 && !req.MarkReady {
		return c.Status(400).JSON(fiber.Map{"error": "nothing_to_assign"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 60*time.Second)
	defer cancel()

	// Validate product/distributor if provided
	if req.ProductID > 0 {
		var active bool
		err := h.DB.QueryRow(ctx, `SELECT is_active FROM products WHERE id=$1`, req.ProductID).Scan(&active)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "product_not_found"})
		}
		if !active {
			return c.Status(400).JSON(fiber.Map{"error": "product_inactive"})
		}
	}
	if req.DistributorID > 0 {
		var active bool
		err := h.DB.QueryRow(ctx, `SELECT is_active FROM distributors WHERE id=$1`, req.DistributorID).Scan(&active)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "distributor_not_found"})
		}
		if !active {
			return c.Status(400).JSON(fiber.Map{"error": "distributor_inactive"})
		}
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_begin"})
	}
	defer tx.Rollback(ctx)

	// Build SET clause dynamically
	setParts := []string{}
	args := []any{}
	argN := 0
	if req.ProductID > 0 {
		argN++
		setParts = append(setParts, fmt.Sprintf("product_id = $%d", argN))
		args = append(args, req.ProductID)
	}
	if req.DistributorID > 0 {
		argN++
		setParts = append(setParts, fmt.Sprintf("distributor_id = $%d", argN))
		args = append(args, req.DistributorID)
	}
	if req.MarkReady {
		setParts = append(setParts, "is_ready = TRUE")
	}
	argN++
	batchArg := argN
	args = append(args, batchID)
	argN++
	fromArg := argN
	args = append(args, req.FromSerial)
	argN++
	toArg := argN
	args = append(args, req.ToSerial)

	setClause := ""
	for i, s := range setParts {
		if i > 0 {
			setClause += ", "
		}
		setClause += s
	}
	sql := fmt.Sprintf(`
		UPDATE qr_tokens SET %s
		WHERE batch_id = $%d AND serial_no BETWEEN $%d AND $%d
	`, setClause, batchArg, fromArg, toArg)

	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	updated := int(tag.RowsAffected())
	if updated == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "no_tokens_in_range"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	// Log assignment
	_, err = tx.Exec(ctx, `
		INSERT INTO token_assignments (batch_id, from_serial, to_serial, product_id, distributor_id, tokens_updated, notes, assigned_by)
		VALUES ($1, $2, $3, NULLIF($4, 0)::BIGINT, NULLIF($5, 0)::BIGINT, $6, NULLIF($7, ''), $8)
	`, batchID, req.FromSerial, req.ToSerial, req.ProductID, req.DistributorID, updated, req.Notes, nullIfZeroInt64(adminID))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "log_failed"})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx_commit"})
	}

	return c.JSON(fiber.Map{"success": true, "tokens_updated": updated})
}
