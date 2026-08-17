package handlers

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// OrderHandler manages "Buy more" orders: consumers place them from the
// public GS1 verify page (/auth/:code), scoped to the brand behind the code
// they scanned, and admins manage them at /admin/orders.
type OrderHandler struct {
	DB     *pgxpool.Pool
	Tokens *services.TokenService
	Audit  *services.AuditLogger
}

var validOrderStatuses = map[string]bool{
	"new": true, "contacted": true, "completed": true, "cancelled": true,
}

// resolveBrandFromCode re-validates the GS1 verify code offline (HMAC) then
// looks up which brand/label it belongs to, so a consumer can only order
// sizes that actually belong to the product they scanned.
func (h *OrderHandler) resolveBrandFromCode(ctx context.Context, code string) (brandID int64, labelID int64, err error) {
	if code == "" || !h.Tokens.Verify(code) {
		return 0, 0, pgx.ErrNoRows
	}
	err = h.DB.QueryRow(ctx, `
		SELECT gl.brand_id, gl.id
		FROM gs1_label_units u
		JOIN gs1_labels gl ON gl.id = u.label_id
		WHERE u.verify_code = $1 AND gl.brand_id IS NOT NULL
	`, code).Scan(&brandID, &labelID)
	return brandID, labelID, err
}

// ---------------- Public: size options for "Buy more" ----------------

type publicSizeSpecRow struct {
	ID          int64   `json:"id"`
	Spec        string  `json:"spec"`
	SizeSpec    *string `json:"size_spec"`
	ProductLine *string `json:"product_line"`
}

func (h *OrderHandler) PublicSizeOptions(c *fiber.Ctx) error {
	code := c.Query("code")
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	brandID, _, err := h.resolveBrandFromCode(ctx, code)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_code"})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, spec, size_spec, product_line
		FROM gs1_size_specs WHERE brand_id = $1
		ORDER BY product_line ASC NULLS LAST, spec ASC
	`, brandID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []publicSizeSpecRow{}
	for rows.Next() {
		var r publicSizeSpecRow
		if err := rows.Scan(&r.ID, &r.Spec, &r.SizeSpec, &r.ProductLine); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

// ---------------- Public: submit order ----------------

type publicOrderItemBody struct {
	SizeSpecID int64 `json:"size_spec_id"`
	Quantity   int   `json:"quantity"`
}

type publicOrderBody struct {
	Code         string                `json:"code"`
	CustomerName string                `json:"customer_name"`
	Phone        string                `json:"phone"`
	Address      string                `json:"address"`
	Items        []publicOrderItemBody `json:"items"`
}

func (h *OrderHandler) CreatePublic(c *fiber.Ctx) error {
	var b publicOrderBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	b.CustomerName = strings.TrimSpace(b.CustomerName)
	b.Phone = strings.TrimSpace(b.Phone)
	b.Address = strings.TrimSpace(b.Address)
	if b.CustomerName == "" || b.Phone == "" || b.Address == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name_phone_address_required"})
	}
	if len(b.CustomerName) > 150 || len(b.Phone) > 30 || len(b.Address) > 300 {
		return c.Status(400).JSON(fiber.Map{"error": "field_too_long"})
	}
	if len(b.Items) == 0 || len(b.Items) > 50 {
		return c.Status(400).JSON(fiber.Map{"error": "items_invalid"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 8*time.Second)
	defer cancel()

	brandID, labelID, err := h.resolveBrandFromCode(ctx, b.Code)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "invalid_code"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	defer tx.Rollback(ctx)

	var orderID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (brand_id, label_id, customer_name, phone, address)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, brandID, labelID, b.CustomerName, b.Phone, b.Address).Scan(&orderID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	inserted := 0
	for _, item := range b.Items {
		if item.Quantity <= 0 || item.Quantity > 9999 {
			continue
		}
		var spec string
		var sizeSpec, productLine *string
		err := tx.QueryRow(ctx, `
			SELECT spec, size_spec, product_line FROM gs1_size_specs
			WHERE id = $1 AND brand_id = $2
		`, item.SizeSpecID, brandID).Scan(&spec, &sizeSpec, &productLine)
		if err != nil {
			continue // skip items that don't belong to this brand
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO order_items (order_id, size_spec_id, spec, size_spec, product_line, quantity)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, orderID, item.SizeSpecID, spec, sizeSpec, productLine, item.Quantity)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
		inserted++
	}
	if inserted == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "no_valid_items"})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	return c.Status(201).JSON(fiber.Map{"id": orderID, "success": true})
}

// ---------------- Admin ----------------

type orderRow struct {
	ID           int64     `json:"id"`
	BrandID      int64     `json:"brand_id"`
	BrandName    string    `json:"brand_name"`
	CustomerName string    `json:"customer_name"`
	Phone        string    `json:"phone"`
	Address      *string   `json:"address"`
	Status       string    `json:"status"`
	Note         *string   `json:"note"`
	ItemCount    int       `json:"item_count"`
	TotalQty     int       `json:"total_qty"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *OrderHandler) List(c *fiber.Ctx) error {
	status := c.Query("status")
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.brand_id, COALESCE(b.name,''), o.customer_name, o.phone, o.address, o.status, o.note,
		       COUNT(oi.id), COALESCE(SUM(oi.quantity),0), o.created_at
		FROM orders o
		LEFT JOIN brands b ON b.id = o.brand_id
		LEFT JOIN order_items oi ON oi.order_id = o.id
		WHERE ($1 = '' OR o.status = $1)
		GROUP BY o.id, b.name
		ORDER BY o.created_at DESC
		LIMIT 500
	`, status)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []orderRow{}
	for rows.Next() {
		var r orderRow
		if err := rows.Scan(&r.ID, &r.BrandID, &r.BrandName, &r.CustomerName, &r.Phone, &r.Address, &r.Status, &r.Note,
			&r.ItemCount, &r.TotalQty, &r.CreatedAt); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

type orderItemRow struct {
	ID          int64   `json:"id"`
	Spec        string  `json:"spec"`
	SizeSpec    *string `json:"size_spec"`
	ProductLine *string `json:"product_line"`
	Quantity    int     `json:"quantity"`
}

type orderDetail struct {
	orderRow
	Items []orderItemRow `json:"items"`
}

func (h *OrderHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var d orderDetail
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, o.brand_id, COALESCE(b.name,''), o.customer_name, o.phone, o.address, o.status, o.note, o.created_at
		FROM orders o LEFT JOIN brands b ON b.id = o.brand_id
		WHERE o.id = $1
	`, id).Scan(&d.ID, &d.BrandID, &d.BrandName, &d.CustomerName, &d.Phone, &d.Address, &d.Status, &d.Note, &d.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	rows, err := h.DB.Query(ctx, `
		SELECT id, spec, size_spec, product_line, quantity FROM order_items
		WHERE order_id = $1 ORDER BY id ASC
	`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	d.Items = []orderItemRow{}
	for rows.Next() {
		var r orderItemRow
		if err := rows.Scan(&r.ID, &r.Spec, &r.SizeSpec, &r.ProductLine, &r.Quantity); err == nil {
			d.Items = append(d.Items, r)
			d.ItemCount++
			d.TotalQty += r.Quantity
		}
	}
	return c.JSON(d)
}

func (h *OrderHandler) UpdateStatus(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	if !validOrderStatuses[b.Status] {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_status"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `UPDATE orders SET status = $1 WHERE id = $2`, b.Status, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "order.update_status", "order", strconv.FormatInt(id, 10),
		fiber.Map{"status": b.Status}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *OrderHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `DELETE FROM orders WHERE id = $1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "order.delete", "order", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
