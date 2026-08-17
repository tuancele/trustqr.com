package handlers

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Module VOUCHER — đối chiếu mã giảm giá do QR/GS1 phát hành khi khách hàng
// cung cấp mã để đổi ưu đãi.
//   GET /admin/vouchers?q=<voucher|sđt>

type VoucherHandler struct {
	DB *pgxpool.Pool
}

type voucherRow struct {
	Source      string    `json:"source"` // "qr" | "gs1"
	Voucher     string    `json:"voucher"`
	Phone       string    `json:"phone"`
	FullName    string    `json:"full_name"`
	ProductName string    `json:"product_name"`
	Code        string    `json:"code"` // secret_code / verify_code of the stamp
	ActivatedAt time.Time `json:"activated_at"`
}

func (h *VoucherHandler) List(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	q := strings.TrimSpace(c.Query("q"))
	var like *string
	if q != "" {
		s := "%" + q + "%"
		like = &s
	}

	rows, err := h.DB.Query(ctx, `
		SELECT * FROM (
			SELECT 'qr' AS source, t.activated_voucher AS voucher, COALESCE(t.activated_phone,'') AS phone,
			       '' AS full_name, COALESCE(b.product_name,'') AS product_name,
			       t.secret_code AS code, t.activated_at AS activated_at
			FROM qr_tokens t
			JOIN batches b ON b.id = t.batch_id
			WHERE t.activated_voucher IS NOT NULL

			UNION ALL

			SELECT 'gs1' AS source, u.activated_voucher AS voucher, COALESCE(u.activated_phone,'') AS phone,
			       COALESCE(u.activated_name,'') AS full_name, COALESCE(gl.product_name,'') AS product_name,
			       u.verify_code AS code, u.activated_at AS activated_at
			FROM gs1_label_units u
			JOIN gs1_labels gl ON gl.id = u.label_id
			WHERE u.activated_voucher IS NOT NULL
		) vouchers
		WHERE $1::text IS NULL OR voucher ILIKE $1 OR phone ILIKE $1
		ORDER BY activated_at DESC
		LIMIT 500
	`, like)
	if err != nil {
		log.Printf("vouchers list error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal"})
	}
	defer rows.Close()

	out := []voucherRow{}
	for rows.Next() {
		var v voucherRow
		if err := rows.Scan(&v.Source, &v.Voucher, &v.Phone, &v.FullName, &v.ProductName, &v.Code, &v.ActivatedAt); err != nil {
			log.Printf("vouchers scan error: %v", err)
			continue
		}
		out = append(out, v)
	}

	return c.JSON(fiber.Map{"vouchers": out})
}
