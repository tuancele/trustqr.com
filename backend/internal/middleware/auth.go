package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"trustqr/backend/internal/services"
)

const CtxAdminID = "admin_id"
const CtxAdminEmail = "admin_email"

// RequireAccessToken parses the Authorization header, requires kind="access", and stores admin info in ctx.
func RequireAccessToken(auth *services.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			return c.Status(401).JSON(fiber.Map{"error": "missing_token"})
		}
		tok := strings.TrimPrefix(h, "Bearer ")
		claims, err := auth.Parse(tok)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{"error": "invalid_token"})
		}
		if claims.Kind != "access" {
			return c.Status(401).JSON(fiber.Map{"error": "wrong_token_kind"})
		}
		c.Locals(CtxAdminID, claims.AdminID)
		c.Locals(CtxAdminEmail, claims.Email)
		return c.Next()
	}
}
