package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv                    string
	AppPort                   string
	PublicBaseURL             string
	QRHMACSecret              string
	JWTSecret                 string
	DBHost                    string
	DBPort                    string
	DBUser                    string
	DBPassword                string
	DBName                    string
	DBSSLMode                 string
	RedisAddr                 string
	RedisPassword             string
	CORSOrigins               string
	TemplateStorageDir        string
	ProductImageStorageDir    string
	BrandLogoStorageDir       string
	PromoBannerStorageDir     string
	ContentImageStorageDir    string
	GS1ProductImageStorageDir string
	GS1DocumentStorageDir     string
}

func Load() *Config {
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	c := &Config{
		AppEnv:                    env("APP_ENV", "development"),
		AppPort:                   env("APP_PORT", "8080"),
		PublicBaseURL:             env("PUBLIC_BASE_URL", "http://localhost:3000"),
		QRHMACSecret:              env("QR_HMAC_SECRET", ""),
		JWTSecret:                 env("JWT_SECRET", ""),
		DBHost:                    env("DB_HOST", "localhost"),
		DBPort:                    env("DB_PORT", "5432"),
		DBUser:                    env("DB_USER", "postgres"),
		DBPassword:                env("DB_PASSWORD", "postgres"),
		DBName:                    env("DB_NAME", "trustqr"),
		DBSSLMode:                 env("DB_SSLMODE", "disable"),
		RedisAddr:                 env("REDIS_ADDR", "localhost:6379"),
		RedisPassword:             env("REDIS_PASSWORD", ""),
		CORSOrigins:               env("CORS_ORIGINS", "http://localhost:3000"),
		TemplateStorageDir:        env("TEMPLATE_STORAGE_DIR", "./storage/templates"),
		ProductImageStorageDir:    env("PRODUCT_IMAGE_STORAGE_DIR", "./storage/product-images"),
		BrandLogoStorageDir:       env("BRAND_LOGO_STORAGE_DIR", "./storage/brand-logos"),
		PromoBannerStorageDir:     env("PROMO_BANNER_STORAGE_DIR", "./storage/banners"),
		ContentImageStorageDir:    env("CONTENT_IMAGE_STORAGE_DIR", "./storage/content-images"),
		GS1ProductImageStorageDir: env("GS1_PRODUCT_IMAGE_STORAGE_DIR", "./storage/gs1-product-images"),
		GS1DocumentStorageDir:     env("GS1_DOCUMENT_STORAGE_DIR", "./storage/gs1-documents"),
	}

	if c.QRHMACSecret == "" {
		panic("QR_HMAC_SECRET is required")
	}
	if c.JWTSecret == "" {
		panic("JWT_SECRET is required")
	}
	return c
}

func (c *Config) DatabaseURL() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName, c.DBSSLMode)
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
