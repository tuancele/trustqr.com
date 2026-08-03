package handlers

import (
	"context"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v2"

	"trustqr/backend/internal/middleware"
)

type twoFAStatusResp struct {
	Enabled     bool   `json:"enabled"`
	Configured  bool   `json:"configured"`  // true if secret exists
}

// Status returns whether 2FA is currently enabled for this admin.
func (h *AuthHandler) TwoFAStatus(c *fiber.Ctx) error {
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var enabled bool
	var secret string
	err := h.DB.QueryRow(ctx, `SELECT totp_enabled, totp_secret FROM admin_users WHERE id=$1`, adminID).
		Scan(&enabled, &secret)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	return c.JSON(twoFAStatusResp{
		Enabled:    enabled,
		Configured: secret != "",
	})
}

// SetupBegin generates a NEW TOTP secret and returns provisioning URL.
// The secret is stored immediately but NOT yet activated (totp_enabled stays as is until confirmed).
func (h *AuthHandler) TwoFASetupBegin(c *fiber.Ctx) error {
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	email, _ := c.Locals(middleware.CtxAdminEmail).(string)

	key, err := h.Auth.GenerateTOTPSecret(email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "generate_secret"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()
	_, err = h.DB.Exec(ctx, `UPDATE admin_users SET totp_secret=$1 WHERE id=$2`, key.Secret(), adminID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "save_secret"})
	}

	return c.JSON(fiber.Map{
		"secret":    key.Secret(),
		"otpauth":   key.URL(),
		"qr_helper": "https://api.qrserver.com/v1/create-qr-code/?data=" + url.QueryEscape(key.URL()),
	})
}

type toggleReq struct {
	Code string `json:"code"`
}

// Enable activates 2FA. Requires a valid TOTP code from the current secret to prove setup was completed.
func (h *AuthHandler) TwoFAEnable(c *fiber.Ctx) error {
	var req toggleReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var secret string
	err := h.DB.QueryRow(ctx, `SELECT totp_secret FROM admin_users WHERE id=$1`, adminID).Scan(&secret)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if secret == "" {
		return c.Status(400).JSON(fiber.Map{"error": "not_setup", "message": "Chưa thiết lập secret. Gọi /2fa/setup trước."})
	}
	if !h.Auth.VerifyTOTP(secret, req.Code) {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_code"})
	}

	_, err = h.DB.Exec(ctx, `UPDATE admin_users SET totp_enabled=TRUE WHERE id=$1`, adminID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "save"})
	}
	h.logAudit(c, adminID, "2fa.enable", nil)
	return c.JSON(fiber.Map{"success": true, "enabled": true})
}

// Disable turns off 2FA. Requires valid TOTP code AS PROOF (can't disable without knowing current 2FA).
func (h *AuthHandler) TwoFADisable(c *fiber.Ctx) error {
	var req toggleReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_body"})
	}
	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)

	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	var secret string
	var enabled bool
	err := h.DB.QueryRow(ctx, `SELECT totp_secret, totp_enabled FROM admin_users WHERE id=$1`, adminID).
		Scan(&secret, &enabled)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}
	if !enabled {
		return c.JSON(fiber.Map{"success": true, "enabled": false, "message": "already_disabled"})
	}
	// Require correct TOTP code to disable — prevents attacker with stolen session from silently disabling 2FA
	if secret != "" && !h.Auth.VerifyTOTP(secret, req.Code) {
		return c.Status(401).JSON(fiber.Map{"error": "invalid_code", "message": "Cần nhập đúng mã 2FA hiện tại để tắt."})
	}

	_, err = h.DB.Exec(ctx, `UPDATE admin_users SET totp_enabled=FALSE WHERE id=$1`, adminID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "save"})
	}
	h.logAudit(c, adminID, "2fa.disable", nil)
	return c.JSON(fiber.Map{"success": true, "enabled": false})
}

// logAudit records an admin action (best-effort, non-blocking).
func (h *AuthHandler) logAudit(c *fiber.Ctx, adminID int64, action string, payload any) {
	if h.Audit == nil {
		return
	}
	ip := middleware.ClientIP(c)
	h.Audit.Log(adminID, action, "admin_user", "", payload, ip, c.Get("User-Agent"))
}
