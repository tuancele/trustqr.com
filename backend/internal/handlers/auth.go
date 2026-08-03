package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

type AuthHandler struct {
	DB    *pgxpool.Pool
	Auth  *services.AuthService
	Audit *services.AuditLogger
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResp struct {
	TempToken    string `json:"temp_token,omitempty"`
	Requires     string `json:"requires"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var (
		id             int64
		hash           string
		totpSecret     string
		totpEnabled    bool
		isActive       bool
		failedAttempts int
		lockedUntil    *time.Time
	)
	err := h.DB.QueryRow(ctx, `
		SELECT id, password_hash, totp_secret, totp_enabled, is_active, failed_attempts, locked_until
		FROM admin_users WHERE email = $1
	`, email).Scan(&id, &hash, &totpSecret, &totpEnabled, &isActive, &failedAttempts, &lockedUntil)
	if err != nil {
		// Same error for missing user vs wrong password to prevent enumeration
		return c.Status(401).JSON(fiber.Map{"error": "invalid_credentials"})
	}
	if !isActive {
		return c.Status(403).JSON(fiber.Map{"error": "account_disabled"})
	}
	if lockedUntil != nil && lockedUntil.After(time.Now()) {
		return c.Status(423).JSON(fiber.Map{"error": "account_locked", "until": lockedUntil})
	}

	if !h.Auth.VerifyPassword(hash, req.Password) {
		newAttempts := failedAttempts + 1
		if newAttempts >= 5 {
			until := time.Now().Add(15 * time.Minute)
			_, _ = h.DB.Exec(ctx, `UPDATE admin_users SET failed_attempts=$1, locked_until=$2 WHERE id=$3`, newAttempts, until, id)
		} else {
			_, _ = h.DB.Exec(ctx, `UPDATE admin_users SET failed_attempts=$1 WHERE id=$2`, newAttempts, id)
		}
		return c.Status(401).JSON(fiber.Map{"error": "invalid_credentials"})
	}

	// Reset failed attempts on successful password
	_, _ = h.DB.Exec(ctx, `UPDATE admin_users SET failed_attempts=0, locked_until=NULL WHERE id=$1`, id)

	// If 2FA is disabled, issue access token directly (skip TOTP step)
	if !totpEnabled || totpSecret == "" {
		access, err := h.Auth.IssueAccessToken(id, email)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "issue_access"})
		}
		refresh, err := h.Auth.IssueRefreshToken(id, email)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "issue_refresh"})
		}
		ip := ""
		if xff := c.Get("X-Forwarded-For"); xff != "" {
			ip = xff
		} else {
			ip = c.IP()
		}
		_, _ = h.DB.Exec(ctx, `UPDATE admin_users SET last_login_at=NOW(), last_login_ip=NULLIF($1,'')::inet WHERE id=$2`, ip, id)
		return c.JSON(loginResp{
			AccessToken:  access,
			RefreshToken: refresh,
			ExpiresIn:    15 * 60,
			Requires:     "none",
		})
	}

	// 2FA enabled → require TOTP step
	tt, err := h.Auth.IssueTempToken(id, email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "issue_token"})
	}
	return c.JSON(loginResp{TempToken: tt, Requires: "totp"})
}

type totpReq struct {
	TempToken string `json:"temp_token"`
	Code      string `json:"code"`
}

type tokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (h *AuthHandler) Verify2FA(c *fiber.Ctx) error {
	var req totpReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	claims, err := h.Auth.Parse(req.TempToken)
	if err != nil || claims.Kind != "temp" {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_temp_token"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var totpSecret string
	err = h.DB.QueryRow(ctx, `SELECT totp_secret FROM admin_users WHERE id=$1`, claims.AdminID).Scan(&totpSecret)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "user_not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db_error"})
	}

	if !h.Auth.VerifyTOTP(totpSecret, req.Code) {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_totp"})
	}

	access, err := h.Auth.IssueAccessToken(claims.AdminID, claims.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "issue_access"})
	}
	refresh, err := h.Auth.IssueRefreshToken(claims.AdminID, claims.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "issue_refresh"})
	}

	ip := middleware.ClientIP(c)
	_, _ = h.DB.Exec(ctx, `UPDATE admin_users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, nullIfEmpty(ip), claims.AdminID)

	return c.JSON(tokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    15 * 60,
	})
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req refreshReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	claims, err := h.Auth.Parse(req.RefreshToken)
	if err != nil || claims.Kind != "refresh" {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_refresh"})
	}
	access, err := h.Auth.IssueAccessToken(claims.AdminID, claims.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "issue_access"})
	}
	return c.JSON(fiber.Map{"access_token": access, "expires_in": 15 * 60})
}

// Me returns basic info of the authenticated admin.
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	id, _ := c.Locals(middleware.CtxAdminID).(int64)
	email, _ := c.Locals(middleware.CtxAdminEmail).(string)
	return c.JSON(fiber.Map{"id": id, "email": email})
}
