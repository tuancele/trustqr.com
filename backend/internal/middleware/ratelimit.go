package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// RateLimit returns a Fiber middleware that limits requests per key.
// keyFn extracts the identifier (e.g., IP or phone). If it returns "", no limit.
func RateLimit(rdb *redis.Client, name string, max int, window time.Duration, keyFn func(*fiber.Ctx) string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := keyFn(c)
		if key == "" {
			return c.Next()
		}
		ctx := context.Background()
		redisKey := fmt.Sprintf("rl:%s:%s", name, key)

		count, err := rdb.Incr(ctx, redisKey).Result()
		if err != nil {
			// Fail-open on Redis error - don't block legitimate users
			return c.Next()
		}
		if count == 1 {
			rdb.Expire(ctx, redisKey, window)
		}
		if count > int64(max) {
			return c.Status(429).JSON(fiber.Map{
				"error":       "rate_limit_exceeded",
				"retry_after": int(window.Seconds()),
			})
		}
		return c.Next()
	}
}

// ClientIP extracts the real client IP. Fiber's c.IP() only reads the
// X-Forwarded-For header when the immediate TCP peer is a trusted proxy
// (see EnableTrustedProxyCheck/TrustedProxies in cmd/api/main.go) — for any
// other caller it returns the raw socket address, which can't be spoofed.
func ClientIP(c *fiber.Ctx) string {
	return c.IP()
}
