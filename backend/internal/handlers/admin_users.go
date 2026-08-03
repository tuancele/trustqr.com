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

type AdminUserHandler struct {
	DB    *pgxpool.Pool
	Auth  *services.AuthService
	Audit *services.AuditLogger
}

type adminUserBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	IsActive *bool  `json:"is_active"`
	Reset2FA bool   `json:"reset_2fa"`
	Unlock   bool   `json:"unlock"`
}

type adminUserRow struct {
	ID             int64      `json:"id"`
	Email          string     `json:"email"`
	IsActive       bool       `json:"is_active"`
	TotpEnabled    bool       `json:"totp_enabled"`
	TotpConfigured bool       `json:"totp_configured"`
	FailedAttempts int        `json:"failed_attempts"`
	LockedUntil    *time.Time `json:"locked_until"`
	LastLoginAt    *time.Time `json:"last_login_at"`
	LastLoginIP    *string    `json:"last_login_ip"`
	CreatedAt      time.Time  `json:"created_at"`
}

func (h *AdminUserHandler) List(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.DB.Query(ctx, `
		SELECT id, email, is_active, totp_enabled, (totp_secret <> ''), failed_attempts,
		       locked_until, last_login_at, last_login_ip::text, created_at
		FROM admin_users ORDER BY id ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	out := []adminUserRow{}
	for rows.Next() {
		var r adminUserRow
		if err := rows.Scan(&r.ID, &r.Email, &r.IsActive, &r.TotpEnabled, &r.TotpConfigured,
			&r.FailedAttempts, &r.LockedUntil, &r.LastLoginAt, &r.LastLoginIP, &r.CreatedAt); err == nil {
			out = append(out, r)
		}
	}
	return c.JSON(out)
}

func (h *AdminUserHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var r adminUserRow
	err = h.DB.QueryRow(ctx, `
		SELECT id, email, is_active, totp_enabled, (totp_secret <> ''), failed_attempts,
		       locked_until, last_login_at, last_login_ip::text, created_at
		FROM admin_users WHERE id = $1`, id).
		Scan(&r.ID, &r.Email, &r.IsActive, &r.TotpEnabled, &r.TotpConfigured,
			&r.FailedAttempts, &r.LockedUntil, &r.LastLoginAt, &r.LastLoginIP, &r.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(r)
}

func (h *AdminUserHandler) Create(c *fiber.Ctx) error {
	var b adminUserBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	email := strings.ToLower(strings.TrimSpace(b.Email))
	if email == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email_required"})
	}
	if len(b.Password) < 8 {
		return c.Status(400).JSON(fiber.Map{"error": "password_too_short", "message": "Mật khẩu tối thiểu 8 ký tự"})
	}

	hash, err := h.Auth.HashPassword(b.Password)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "hash_failed"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var id int64
	err = h.DB.QueryRow(ctx, `
		INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) RETURNING id
	`, email, hash).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return c.Status(409).JSON(fiber.Map{"error": "email_exists", "message": "Email đã được sử dụng"})
		}
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	h.Audit.Log(adminID, "admin_user.create", "admin_user", strconv.FormatInt(id, 10),
		fiber.Map{"email": email}, middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *AdminUserHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	var b adminUserBody
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	if id == adminID && b.IsActive != nil && !*b.IsActive {
		return c.Status(400).JSON(fiber.Map{"error": "cannot_disable_self"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var exists bool
	if err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_users WHERE id=$1)`, id).Scan(&exists); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if !exists {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	if b.Email != "" {
		email := strings.ToLower(strings.TrimSpace(b.Email))
		if _, err := h.DB.Exec(ctx, `UPDATE admin_users SET email=$1 WHERE id=$2`, email, id); err != nil {
			if strings.Contains(err.Error(), "duplicate key") {
				return c.Status(409).JSON(fiber.Map{"error": "email_exists", "message": "Email đã được sử dụng"})
			}
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}
	if b.Password != "" {
		if len(b.Password) < 8 {
			return c.Status(400).JSON(fiber.Map{"error": "password_too_short", "message": "Mật khẩu tối thiểu 8 ký tự"})
		}
		hash, err := h.Auth.HashPassword(b.Password)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "hash_failed"})
		}
		if _, err := h.DB.Exec(ctx, `UPDATE admin_users SET password_hash=$1 WHERE id=$2`, hash, id); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
	}
	if b.IsActive != nil {
		if _, err := h.DB.Exec(ctx, `UPDATE admin_users SET is_active=$1 WHERE id=$2`, *b.IsActive, id); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
	}
	if b.Reset2FA {
		if _, err := h.DB.Exec(ctx, `UPDATE admin_users SET totp_secret='', totp_enabled=TRUE WHERE id=$1`, id); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
	}
	if b.Unlock {
		if _, err := h.DB.Exec(ctx, `UPDATE admin_users SET failed_attempts=0, locked_until=NULL WHERE id=$1`, id); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "db"})
		}
	}

	h.Audit.Log(adminID, "admin_user.update", "admin_user", strconv.FormatInt(id, 10),
		fiber.Map{"email": b.Email, "is_active": b.IsActive, "reset_2fa": b.Reset2FA, "unlock": b.Unlock},
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *AdminUserHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	if id == adminID {
		return c.Status(400).JSON(fiber.Map{"error": "cannot_delete_self"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var total int
	if err := h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM admin_users`).Scan(&total); err == nil && total <= 1 {
		return c.Status(400).JSON(fiber.Map{"error": "cannot_delete_last_admin"})
	}

	tag, err := h.DB.Exec(ctx, `DELETE FROM admin_users WHERE id=$1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}
	h.Audit.Log(adminID, "admin_user.delete", "admin_user", strconv.FormatInt(id, 10), nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"deleted": true})
}
