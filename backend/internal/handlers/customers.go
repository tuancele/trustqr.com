package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"trustqr/backend/internal/middleware"
)

// Module KHÁCH HÀNG (customer_leads)
//   GET    /admin/customers          list + thống kê + tổng hợp sản phẩm đã mua
//   GET    /admin/customers/:id      hồ sơ chi tiết + lịch sử kích hoạt + lịch sử quét
//   PUT    /admin/customers/:id      admin bổ sung tên / địa chỉ / ghi chú
//   GET    /admin/customers/export   CSV
//
// Ghi chú: khách được định danh bằng SĐT (customer_leads.phone).
// Tem đã kích hoạt liên kết qua qr_tokens.activated_phone.

// Sản phẩm hiệu lực của 1 tem = token.product_id ?? batch.product_id
const custActivationsJoin = `
	FROM qr_tokens t
	JOIN batches b        ON b.id = t.batch_id
	LEFT JOIN products p  ON p.id = COALESCE(t.product_id, b.product_id)
	LEFT JOIN companies co ON co.id = p.company_id
	LEFT JOIN distributors d ON d.id = t.distributor_id
`

type customerRow struct {
	ID                  int64      `json:"id"`
	Phone               string     `json:"phone"`
	FullName            string     `json:"full_name"`
	Email               string     `json:"email"`
	Address             string     `json:"address"`
	City                string     `json:"city"`
	Province            string     `json:"province"`
	Notes               string     `json:"notes"`
	MarketingConsent    bool       `json:"marketing_consent"`
	MarketingConsentAt  *time.Time `json:"marketing_consent_at"`
	TotalProducts       int        `json:"total_activated_products"`
	FirstActivatedAt    *time.Time `json:"first_activated_at"`
	LastActivatedAt     *time.Time `json:"last_activated_at"`
	PolicyVersion       string     `json:"privacy_policy_version"`
	DeletionRequestedAt *time.Time `json:"deletion_requested_at"`

	// Tổng hợp từ tem đã kích hoạt
	Activations     int      `json:"activations"`      // số tem đã kích hoạt = số lần mua
	ScanTotal       int      `json:"scan_total"`       // tổng lượt quét trên các tem đó
	DistinctProduct int      `json:"distinct_products"`// số loại sản phẩm khác nhau
	ProductNames    []string `json:"product_names"`    // tên các loại sản phẩm đã mua
	LastCity        string   `json:"last_city"`        // vị trí lần quét gần nhất
}

const customerSelectCols = `
	cl.id, cl.phone,
	COALESCE(cl.full_name,''), COALESCE(cl.email,''), COALESCE(cl.address,''),
	COALESCE(cl.city,''), COALESCE(cl.province,''), COALESCE(cl.notes,''),
	cl.marketing_consent, cl.marketing_consent_at, cl.total_activated_products,
	cl.first_activated_at, cl.last_activated_at, COALESCE(cl.privacy_policy_version,''),
	cl.deletion_requested_at,
	COALESCE(agg.activations,0), COALESCE(agg.scan_total,0), COALESCE(agg.distinct_products,0),
	COALESCE(agg.product_names, ARRAY[]::text[]), COALESCE(agg.last_city,'')
`

const customerAggJoin = `
	LEFT JOIN LATERAL (
		SELECT COUNT(*)                                        AS activations,
		       COALESCE(SUM(t.scan_count),0)                   AS scan_total,
		       COUNT(DISTINCT COALESCE(t.product_id, b.product_id)) AS distinct_products,
		       COALESCE(
		         array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
		         ARRAY[]::text[]
		       )                                               AS product_names,
		       (array_agg(t.first_scan_city ORDER BY t.activated_at DESC)
		          FILTER (WHERE t.first_scan_city IS NOT NULL AND t.first_scan_city <> ''))[1] AS last_city
		` + custActivationsJoin + `
		WHERE t.activated_phone = cl.phone
	) agg ON TRUE
`

func scanCustomerRow(sc interface{ Scan(...any) error }) (customerRow, error) {
	var r customerRow
	err := sc.Scan(&r.ID, &r.Phone, &r.FullName, &r.Email, &r.Address, &r.City, &r.Province, &r.Notes,
		&r.MarketingConsent, &r.MarketingConsentAt, &r.TotalProducts,
		&r.FirstActivatedAt, &r.LastActivatedAt, &r.PolicyVersion, &r.DeletionRequestedAt,
		&r.Activations, &r.ScanTotal, &r.DistinctProduct, &r.ProductNames, &r.LastCity)
	return r, err
}

// -------- List --------

func (h *AdminExtraHandler) ListCustomers(c *fiber.Ctx) error {
	page := 1
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(c.Query("page_size")); err == nil && ps > 0 && ps <= 200 {
		pageSize = ps
	}
	q := strings.TrimSpace(c.Query("q"))
	filter := c.Query("filter") // "", "marketing", "no_marketing", "deleted"

	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()

	where := ` WHERE 1=1`
	args := []any{}
	if q != "" {
		// Tìm theo SĐT hoặc tên. SĐT lưu E.164 (+84...) nhưng admin hay gõ nội địa (09...)
		args = append(args, "%"+q+"%")
		cond := fmt.Sprintf("cl.phone LIKE $%d OR cl.full_name ILIKE $%d", len(args), len(args))
		if strings.HasPrefix(q, "0") && len(q) > 1 {
			args = append(args, "%+84"+q[1:]+"%")
			cond += fmt.Sprintf(" OR cl.phone LIKE $%d", len(args))
		}
		where += " AND (" + cond + ")"
	}
	switch filter {
	case "marketing":
		where += ` AND cl.marketing_consent = TRUE AND cl.deletion_requested_at IS NULL`
	case "no_marketing":
		where += ` AND cl.marketing_consent = FALSE AND cl.deletion_requested_at IS NULL`
	case "deleted":
		where += ` AND cl.deletion_requested_at IS NOT NULL`
	default:
		where += ` AND cl.deletion_requested_at IS NULL`
	}

	var total int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM customer_leads cl`+where, args...).Scan(&total); err != nil {
		log.Printf("[ListCustomers] count: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "count"})
	}

	args = append(args, pageSize, (page-1)*pageSize)
	rows, err := h.DB.Query(ctx, `
		SELECT`+customerSelectCols+`
		FROM customer_leads cl`+customerAggJoin+where+fmt.Sprintf(`
		ORDER BY cl.last_activated_at DESC NULLS LAST, cl.id DESC
		LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		log.Printf("[ListCustomers] query: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []customerRow{}
	for rows.Next() {
		r, err := scanCustomerRow(rows)
		if err != nil {
			log.Printf("[ListCustomers] scan: %v", err)
			continue
		}
		out = append(out, r)
	}

	// Thống kê tổng, không phụ thuộc phân trang / bộ lọc
	var stTotal, stMarketing, stDeleted, stProducts, stScans int
	_ = h.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM customer_leads WHERE deletion_requested_at IS NULL),
		  (SELECT COUNT(*) FROM customer_leads WHERE marketing_consent AND deletion_requested_at IS NULL),
		  (SELECT COUNT(*) FROM customer_leads WHERE deletion_requested_at IS NOT NULL),
		  (SELECT COUNT(*) FROM qr_tokens WHERE is_activated),
		  (SELECT COALESCE(SUM(scan_count),0) FROM qr_tokens WHERE is_activated)
	`).Scan(&stTotal, &stMarketing, &stDeleted, &stProducts, &stScans)

	return c.JSON(fiber.Map{
		"customers": out,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"stats": fiber.Map{
			"total":            stTotal,
			"marketing":        stMarketing,
			"deletion_request": stDeleted,
			"products":         stProducts,
			"scans":            stScans,
		},
	})
}

// -------- Detail --------

type customerActivation struct {
	TokenID     int64      `json:"token_id"`
	SecretCode  string     `json:"secret_code"`
	SerialNo    int        `json:"serial_no"`
	BatchCode   string     `json:"batch_code"`
	ProductID   *int64     `json:"product_id"`
	ProductName string     `json:"product_name"`
	CompanyName string     `json:"company_name"`
	Distributor string     `json:"distributor_name"`
	Voucher     string     `json:"voucher"`
	ActivatedAt *time.Time `json:"activated_at"`
	ScanCount   int        `json:"scan_count"`
	FirstScanAt *time.Time `json:"first_scanned_at"`
	City        string     `json:"first_scan_city"`
	Status      string     `json:"status"`
}

type customerScan struct {
	ScannedAt time.Time `json:"scanned_at"`
	City      string    `json:"city"`
	Region    string    `json:"region"`
	Country   string    `json:"country"`
	IP        string    `json:"ip"`
	Lat       *float64  `json:"device_lat"`
	Lng       *float64  `json:"device_lng"`
	IsRepeat  bool      `json:"is_repeat"`
	Code      string    `json:"secret_code"`
	Product   string    `json:"product_name"`
}

func (h *AdminExtraHandler) GetCustomer(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()

	cust, err := scanCustomerRow(h.DB.QueryRow(ctx, `
		SELECT`+customerSelectCols+`
		FROM customer_leads cl`+customerAggJoin+`
		WHERE cl.id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		log.Printf("[GetCustomer] scan: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}

	// Lịch sử kích hoạt: mỗi tem = 1 lần mua
	activations := []customerActivation{}
	rows, err := h.DB.Query(ctx, `
		SELECT t.id, t.secret_code, COALESCE(t.serial_no,0), b.batch_code,
		       COALESCE(t.product_id, b.product_id),
		       COALESCE(p.name, COALESCE(b.product_name,'')), COALESCE(co.name,''), COALESCE(d.name,''),
		       COALESCE(t.activated_voucher,''), t.activated_at, t.scan_count, t.first_scanned_at,
		       COALESCE(t.first_scan_city,''), t.status
		`+custActivationsJoin+`
		WHERE t.activated_phone = $1
		ORDER BY t.activated_at DESC NULLS LAST, t.id DESC
		LIMIT 500`, cust.Phone)
	if err != nil {
		log.Printf("[GetCustomer] activations: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "query_activations"})
	}
	for rows.Next() {
		var a customerActivation
		if err := rows.Scan(&a.TokenID, &a.SecretCode, &a.SerialNo, &a.BatchCode, &a.ProductID,
			&a.ProductName, &a.CompanyName, &a.Distributor, &a.Voucher, &a.ActivatedAt,
			&a.ScanCount, &a.FirstScanAt, &a.City, &a.Status); err != nil {
			log.Printf("[GetCustomer] activation scan: %v", err)
			continue
		}
		activations = append(activations, a)
	}
	rows.Close()

	// Tổng hợp theo loại sản phẩm
	type productSummary struct {
		ProductID *int64     `json:"product_id"`
		Name      string     `json:"product_name"`
		Company   string     `json:"company_name"`
		Qty       int        `json:"qty"`
		FirstAt   *time.Time `json:"first_at"`
		LastAt    *time.Time `json:"last_at"`
	}
	products := []productSummary{}
	prows, err := h.DB.Query(ctx, `
		SELECT COALESCE(t.product_id, b.product_id) AS pid,
		       COALESCE(p.name, COALESCE(b.product_name,'(chưa gán sản phẩm)')),
		       COALESCE(co.name,''),
		       COUNT(*), MIN(t.activated_at), MAX(t.activated_at)
		`+custActivationsJoin+`
		WHERE t.activated_phone = $1
		GROUP BY pid, p.name, b.product_name, co.name
		ORDER BY COUNT(*) DESC, MAX(t.activated_at) DESC`, cust.Phone)
	if err == nil {
		for prows.Next() {
			var s productSummary
			if err := prows.Scan(&s.ProductID, &s.Name, &s.Company, &s.Qty, &s.FirstAt, &s.LastAt); err == nil {
				products = append(products, s)
			}
		}
		prows.Close()
	} else {
		log.Printf("[GetCustomer] products: %v", err)
	}

	// Lịch sử quét (vị trí) trên các tem của khách
	scans := []customerScan{}
	srows, err := h.DB.Query(ctx, `
		SELECT s.scanned_at, COALESCE(s.city,''), COALESCE(s.region,''), COALESCE(s.country,''),
		       COALESCE(s.ip_address::text,''), s.device_lat, s.device_lng, s.is_repeat,
		       t.secret_code, COALESCE(p.name, COALESCE(b.product_name,''))
		FROM scan_logs s
		JOIN qr_tokens t ON t.id = s.token_id
		JOIN batches b   ON b.id = t.batch_id
		LEFT JOIN products p ON p.id = COALESCE(t.product_id, b.product_id)
		WHERE t.activated_phone = $1
		ORDER BY s.scanned_at DESC
		LIMIT 100`, cust.Phone)
	if err == nil {
		for srows.Next() {
			var s customerScan
			if err := srows.Scan(&s.ScannedAt, &s.City, &s.Region, &s.Country, &s.IP,
				&s.Lat, &s.Lng, &s.IsRepeat, &s.Code, &s.Product); err == nil {
				scans = append(scans, s)
			}
		}
		srows.Close()
	} else {
		log.Printf("[GetCustomer] scans: %v", err)
	}

	return c.JSON(fiber.Map{
		"customer":    cust,
		"activations": activations,
		"products":    products,
		"scans":       scans,
	})
}

// -------- Update (admin bổ sung thông tin) --------

type updateCustomerReq struct {
	FullName *string `json:"full_name"`
	Email    *string `json:"email"`
	Address  *string `json:"address"`
	City     *string `json:"city"`
	Province *string `json:"province"`
	Notes    *string `json:"notes"`
}

func (h *AdminExtraHandler) UpdateCustomer(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var req updateCustomerReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	// COALESCE: field nào không gửi thì giữ nguyên
	tag, err := h.DB.Exec(ctx, `
		UPDATE customer_leads SET
		  full_name = COALESCE($2, full_name),
		  email     = COALESCE($3, email),
		  address   = COALESCE($4, address),
		  city      = COALESCE($5, city),
		  province  = COALESCE($6, province),
		  notes     = COALESCE($7, notes)
		WHERE id = $1
	`, id, req.FullName, req.Email, req.Address, req.City, req.Province, req.Notes)
	if err != nil {
		log.Printf("[UpdateCustomer] %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "update"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "customer.update", "customer_lead", strconv.FormatInt(id, 10), req,
		middleware.ClientIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"updated": true})
}

// -------- Export CSV --------

func (h *AdminExtraHandler) ExportCustomers(c *fiber.Ctx) error {
	onlyMarketing := c.Query("marketing_only") == "true"
	ctx, cancel := context.WithTimeout(c.Context(), 60*time.Second)
	defer cancel()

	where := ` WHERE cl.deletion_requested_at IS NULL`
	if onlyMarketing {
		where += ` AND cl.marketing_consent = TRUE`
	}

	rows, err := h.DB.Query(ctx, `
		SELECT`+customerSelectCols+`
		FROM customer_leads cl`+customerAggJoin+where+`
		ORDER BY cl.first_activated_at DESC`)
	if err != nil {
		log.Printf("[ExportCustomers] %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // BOM để Excel đọc đúng tiếng Việt
	cw := csv.NewWriter(&buf)
	cw.Write([]string{
		"phone", "full_name", "email", "address", "city", "province",
		"marketing_consent", "activations", "distinct_products", "products",
		"scan_total", "last_city", "first_activated_at", "last_activated_at",
		"policy_version", "notes",
	})

	fmtTime := func(t *time.Time) string {
		if t == nil {
			return ""
		}
		return t.Format(time.RFC3339)
	}

	count := 0
	for rows.Next() {
		r, err := scanCustomerRow(rows)
		if err != nil {
			log.Printf("[ExportCustomers] scan: %v", err)
			continue
		}
		cw.Write([]string{
			r.Phone, r.FullName, r.Email, r.Address, r.City, r.Province,
			strconv.FormatBool(r.MarketingConsent),
			strconv.Itoa(r.Activations), strconv.Itoa(r.DistinctProduct),
			strings.Join(r.ProductNames, " | "),
			strconv.Itoa(r.ScanTotal), r.LastCity,
			fmtTime(r.FirstActivatedAt), fmtTime(r.LastActivatedAt),
			r.PolicyVersion, r.Notes,
		})
		count++
	}
	cw.Flush()

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	h.Audit.Log(adminID, "customers.export", "customer_leads", "",
		fiber.Map{"count": count, "marketing_only": onlyMarketing},
		middleware.ClientIP(c), c.Get("User-Agent"))

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="customers_%s.csv"`, time.Now().Format("20060102")))
	return c.Send(buf.Bytes())
}
