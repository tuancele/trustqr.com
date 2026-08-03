package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

type CustomerHandler struct {
	DB  *pgxpool.Pool
	SMS services.SMSSender
}

type deletionReq struct {
	Phone string `json:"phone"`
}

// RequestDeletion creates a pending deletion request with a short OTP (sent via SMS in prod).
func (h *CustomerHandler) RequestDeletion(c *fiber.Ctx) error {
	var req deletionReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	phone, err := services.NormalizePhoneVN(req.Phone)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_phone"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	otp := random6()
	_, err = h.DB.Exec(ctx, `
		INSERT INTO data_deletion_requests (phone, verify_code, status)
		VALUES ($1, $2, 'pending')
	`, phone, otp)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	// Send OTP via SMS (stub logs to console in dev)
	if err := h.SMS.Send(phone, "Ma xac nhan xoa du lieu TrustQR: "+otp+". Co hieu luc 10 phut."); err != nil {
		log.Printf("sms send: %v", err)
	}

	return c.JSON(fiber.Map{"success": true, "message": "Đã gửi mã xác nhận qua SMS. Nhập mã để hoàn tất xóa dữ liệu."})
}

type deletionConfirmReq struct {
	Phone string `json:"phone"`
	OTP   string `json:"otp"`
}

// ConfirmDeletion verifies the OTP and soft-deletes customer data.
func (h *CustomerHandler) ConfirmDeletion(c *fiber.Ctx) error {
	var req deletionConfirmReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	phone, err := services.NormalizePhoneVN(req.Phone)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_phone"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	// Find matching pending request within 10 minutes
	var reqID int64
	err = h.DB.QueryRow(ctx, `
		SELECT id FROM data_deletion_requests
		WHERE phone = $1 AND verify_code = $2 AND status = 'pending'
		  AND requested_at > NOW() - INTERVAL '10 minutes'
		ORDER BY id DESC LIMIT 1
	`, phone, req.OTP).Scan(&reqID)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_or_expired_otp"})
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "tx"})
	}
	defer tx.Rollback(ctx)

	// Soft-delete: anonymize customer lead but retain aggregate fields
	_, _ = tx.Exec(ctx, `
		UPDATE customer_leads
		SET phone = 'DELETED-' || id, deletion_requested_at = NOW(),
		    marketing_consent = FALSE, marketing_consent_at = NULL
		WHERE phone = $1
	`, phone)
	// Also detach from qr_tokens (keep the code activated but drop the phone link)
	_, _ = tx.Exec(ctx, `UPDATE qr_tokens SET activated_phone = NULL WHERE activated_phone = $1`, phone)
	// Mark request completed
	_, _ = tx.Exec(ctx, `UPDATE data_deletion_requests SET status='completed', completed_at=NOW() WHERE id=$1`, reqID)

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "commit"})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Dữ liệu của bạn đã được xóa."})
}

type unsubReq struct {
	Phone string `json:"phone"`
}

// Unsubscribe opts a phone out of marketing.
func (h *CustomerHandler) Unsubscribe(c *fiber.Ctx) error {
	var req unsubReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	phone, err := services.NormalizePhoneVN(req.Phone)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_phone"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	tag, err := h.DB.Exec(ctx, `
		UPDATE customer_leads SET marketing_consent = FALSE, marketing_consent_at = NULL
		WHERE phone = $1
	`, phone)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "phone_not_found"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Bạn đã ngừng nhận thông báo khuyến mãi."})
}

func random6() string {
	b := make([]byte, 3)
	rand.Read(b)
	h := hex.EncodeToString(b) // 6 hex chars
	// Convert hex to digits by mapping each hex byte mod 10
	out := make([]byte, 6)
	for i, ch := range h {
		if ch >= '0' && ch <= '9' {
			out[i] = byte(ch)
		} else {
			out[i] = byte('0' + (int(ch-'a')+i)%10)
		}
	}
	return string(out)
}
