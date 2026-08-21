package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"trustqr/backend/internal/config"
	"trustqr/backend/internal/database"
	"trustqr/backend/internal/handlers"
	appmw "trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgres(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	rdb, err := database.NewRedis(ctx, cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer rdb.Close()

	// Services
	tokenSvc := services.NewTokenService(cfg.QRHMACSecret)
	authSvc := services.NewAuthService(cfg.JWTSecret)
	geo := services.NewGeoLookup(os.Getenv("GEOIP_DB_PATH"))
	sms := services.NewSMSSender(os.Getenv("SMS_PROVIDER"))
	audit := services.NewAuditLogger(pool)

	// Fraud detection cron
	fraud := services.NewFraudDetector(pool, 15*time.Minute)
	fraud.Start()
	defer fraud.Stop()

	if err := os.MkdirAll(cfg.TemplateStorageDir, 0755); err != nil {
		log.Fatalf("template storage dir: %v", err)
	}
	if err := os.MkdirAll(cfg.ProductImageStorageDir, 0755); err != nil {
		log.Fatalf("product image storage dir: %v", err)
	}
	if err := os.MkdirAll(cfg.BrandLogoStorageDir, 0755); err != nil {
		log.Fatalf("brand logo storage dir: %v", err)
	}
	if err := os.MkdirAll(cfg.PromoBannerStorageDir, 0755); err != nil {
		log.Fatalf("promo banner storage dir: %v", err)
	}
	if err := os.MkdirAll(cfg.ContentImageStorageDir, 0755); err != nil {
		log.Fatalf("content image storage dir: %v", err)
	}

	app := fiber.New(fiber.Config{
		AppName:            "trustqr-api",
		ReadTimeout:        10 * time.Second,
		WriteTimeout:       310 * time.Second,
		IdleTimeout:        60 * time.Second,
		DisableKeepalive:   false,
		ProxyHeader:        "X-Forwarded-For",
		EnableIPValidation: true,
		BodyLimit:          20 * 1024 * 1024,
	})

	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.CORSOrigins,
		AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization,Idempotency-Key",
	}))

	// Health & readiness
	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	app.Get("/ready", func(c *fiber.Ctx) error {
		rctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(rctx); err != nil {
			return c.Status(503).JSON(fiber.Map{"status": "db_down"})
		}
		if err := rdb.Ping(rctx).Err(); err != nil {
			return c.Status(503).JSON(fiber.Map{"status": "redis_down"})
		}
		return c.JSON(fiber.Map{"status": "ready"})
	})

	// Basic metrics endpoint
	app.Get("/metrics", func(c *fiber.Ctx) error {
		var totalScans, totalTokens, activated int
		_ = pool.QueryRow(c.Context(), `
			SELECT
			  (SELECT COALESCE(SUM(scan_count),0) FROM qr_tokens),
			  (SELECT COUNT(*) FROM qr_tokens),
			  (SELECT COUNT(*) FROM qr_tokens WHERE is_activated)
		`).Scan(&totalScans, &totalTokens, &activated)
		c.Set("Content-Type", "text/plain")
		return c.SendString(fmt.Sprintf(
			"trustqr_total_scans %d\ntrustqr_total_tokens %d\ntrustqr_activated_tokens %d\n",
			totalScans, totalTokens, activated,
		))
	})

	// Handlers
	qr := &handlers.QRHandler{DB: pool, Redis: rdb, Tokens: tokenSvc, Geo: geo}
	admin := &handlers.AdminHandler{DB: pool, Tokens: tokenSvc, PublicBaseURL: cfg.PublicBaseURL}
	adminExtra := &handlers.AdminExtraHandler{DB: pool, Audit: audit}
	products := &handlers.ProductHandler{DB: pool, Audit: audit, StorageDir: cfg.ProductImageStorageDir}
	companies := &handlers.CompanyHandler{DB: pool, Audit: audit}
	brands := &handlers.BrandHandler{DB: pool, Audit: audit, StorageDir: cfg.BrandLogoStorageDir}
	banners := &handlers.PromoBannerHandler{DB: pool, Audit: audit, StorageDir: cfg.PromoBannerStorageDir}
	contentImages := &handlers.ContentImageHandler{Audit: audit, StorageDir: cfg.ContentImageStorageDir}
	distributors := &handlers.DistributorHandler{DB: pool, Audit: audit}
	auth := &handlers.AuthHandler{DB: pool, Auth: authSvc, Audit: audit}
	customer := &handlers.CustomerHandler{DB: pool, SMS: sms}
	templates := &handlers.TemplateHandler{DB: pool, Audit: audit, StorageDir: cfg.TemplateStorageDir}
	labelExport := &handlers.LabelExportHandler{DB: pool, PublicBaseURL: cfg.PublicBaseURL}
	adminUsers := &handlers.AdminUserHandler{DB: pool, Auth: authSvc, Audit: audit}
	gs1Label := &handlers.GS1LabelHandler{DB: pool, PublicBaseURL: cfg.PublicBaseURL}
	gs1LabelExport := &handlers.GS1LabelExportHandler{DB: pool, PublicBaseURL: cfg.PublicBaseURL, Tokens: tokenSvc}
	gs1Verify := &handlers.GS1VerifyHandler{DB: pool, Redis: rdb, Tokens: tokenSvc, Geo: geo}
	gs1SizeSpecs := &handlers.GS1SizeSpecHandler{DB: pool, Audit: audit}
	labelLayoutPresets := &handlers.LabelLayoutPresetHandler{DB: pool, Audit: audit}
	orders := &handlers.OrderHandler{DB: pool, Tokens: tokenSvc, Audit: audit}
	settings := &handlers.SettingsHandler{DB: pool}
	vouchers := &handlers.VoucherHandler{DB: pool}
	publicStats := &handlers.PublicStatsHandler{DB: pool}

	api := app.Group("/api/v1")

	// Public QR endpoints - IP rate limit
	api.Post("/qr/verify",
		appmw.RateLimit(rdb, "verify_ip", 20, time.Minute, appmw.ClientIP),
		qr.Verify,
	)
	api.Post("/qr/activate",
		appmw.RateLimit(rdb, "activate_ip", 10, time.Minute, appmw.ClientIP),
		qr.Activate,
	)
	api.Post("/qr/enrich",
		appmw.RateLimit(rdb, "enrich_ip", 20, time.Minute, appmw.ClientIP),
		qr.Enrich,
	)
	api.Post("/gs1/verify",
		appmw.RateLimit(rdb, "gs1_verify_ip", 20, time.Minute, appmw.ClientIP),
		gs1Verify.Verify,
	)

	// Lead-capture voucher badge on the GS1 verify page (/auth/:code)
	api.Post("/gs1/voucher",
		appmw.RateLimit(rdb, "gs1_voucher_ip", 10, time.Minute, appmw.ClientIP),
		gs1Verify.RequestVoucher,
	)

	// "Buy more" — public order form on the GS1 verify page (/auth/:code)
	api.Get("/gs1/order-sizes",
		appmw.RateLimit(rdb, "gs1_order_sizes_ip", 30, time.Minute, appmw.ClientIP),
		orders.PublicSizeOptions,
	)
	api.Post("/gs1/orders",
		appmw.RateLimit(rdb, "gs1_order_create_ip", 10, time.Minute, appmw.ClientIP),
		orders.CreatePublic,
	)

	// Public product/company info (for verify page modal)
	api.Get("/products/:id", products.Get)
	api.Get("/products/:id/images/:imageId/file", products.ServeImage)
	api.Get("/companies/:id", companies.Get)

	// Public marketing homepage stats (live counts, cached client-side)
	api.Get("/public/stats", publicStats.Get)

	// Public promo banners + brand logos (for verify page header)
	api.Get("/banners", banners.PublicList)
	api.Get("/banners/:id/file", banners.ServeImage)
	api.Get("/brands/:id/logo/file", brands.ServeLogo)
	api.Get("/content-images/:filename", contentImages.Serve)

	// Customer NĐ13 endpoints
	api.Post("/customer/deletion-request",
		appmw.RateLimit(rdb, "deletion_ip", 3, time.Hour, appmw.ClientIP),
		customer.RequestDeletion,
	)
	api.Post("/customer/deletion-confirm", customer.ConfirmDeletion)
	api.Post("/customer/unsubscribe",
		appmw.RateLimit(rdb, "unsub_ip", 5, time.Hour, appmw.ClientIP),
		customer.Unsubscribe,
	)

	// Admin auth (login is rate-limited hard)
	adminGroup := api.Group("/admin")
	adminGroup.Post("/auth/login",
		appmw.RateLimit(rdb, "admin_login_ip", 5, 15*time.Minute, appmw.ClientIP),
		auth.Login,
	)
	adminGroup.Post("/auth/2fa", auth.Verify2FA)
	adminGroup.Post("/auth/refresh", auth.Refresh)

	// Protected admin routes
	protected := adminGroup.Group("", appmw.RequireAccessToken(authSvc))
	protected.Get("/auth/me", auth.Me)

	// 2FA management (per-admin toggle)
	protected.Get("/auth/2fa/status", auth.TwoFAStatus)
	protected.Post("/auth/2fa/setup", auth.TwoFASetupBegin)
	protected.Post("/auth/2fa/enable", auth.TwoFAEnable)
	protected.Post("/auth/2fa/disable", auth.TwoFADisable)

	// Admin user management (add/edit/delete admin accounts)
	protected.Get("/users", adminUsers.List)
	protected.Post("/users", adminUsers.Create)
	protected.Get("/users/:id", adminUsers.Get)
	protected.Patch("/users/:id", adminUsers.Update)
	protected.Delete("/users/:id", adminUsers.Delete)

	protected.Post("/batches", admin.CreateBatch)
	protected.Get("/batches", admin.ListBatches)
	protected.Get("/batches/:id", admin.GetBatchDetail)
	protected.Patch("/batches/:id", admin.UpdateBatch)
	protected.Get("/batches/:id/tokens", admin.ListBatchTokens)
	protected.Post("/batches/:id/assign-range", admin.AssignRange)
	protected.Get("/batches/:id/export.csv", admin.ExportBatchCSV)
	protected.Get("/batches/:id/export.zip", admin.ExportBatchZIP)
	protected.Post("/batches/:id/export-labels.pdf", labelExport.ExportLabelsPDF)
	protected.Post("/batches/:id/export-labels-svg.zip", labelExport.ExportLabelsSVGZip)

	protected.Get("/tokens/:code/trace", admin.GetTokenTrace)
	protected.Get("/tokens/:code/qr.png", admin.GetQRImage)
	protected.Patch("/tokens/:id/disable", adminExtra.DisableToken)

	protected.Post("/boxes", adminExtra.AssignBox)

	// GS1 DataMatrix module — standalone admin section (/admin/gs1), fully
	// independent of the QR-token batches/tokens flow above: every field is
	// typed in by the admin, nothing is looked up from those tables.
	protected.Post("/gs1/labels", gs1Label.CreateLabel)
	protected.Get("/gs1/labels", gs1Label.ListLabels)
	protected.Get("/gs1/labels/:id", gs1Label.GetLabel)
	protected.Put("/gs1/labels/:id", gs1Label.UpdateLabel)
	protected.Get("/gs1/labels/:id/units", gs1Label.ListUnits)
	protected.Get("/gs1/units/:id/qr.png", gs1Label.GetUnitQRImage)
	protected.Delete("/gs1/labels/:id", gs1Label.DeleteLabel)
	protected.Post("/gs1/labels/:id/export-labels.pdf", gs1LabelExport.ExportPDF)
	protected.Post("/gs1/labels/:id/export-labels-svg.zip", gs1LabelExport.ExportSVGZip)
	protected.Get("/gs1/size-specs", gs1SizeSpecs.List)
	protected.Post("/gs1/size-specs", gs1SizeSpecs.Create)
	protected.Patch("/gs1/size-specs/:id", gs1SizeSpecs.Update)
	protected.Delete("/gs1/size-specs/:id", gs1SizeSpecs.Delete)

	// Products CRUD
	protected.Get("/products", products.List)
	protected.Post("/products", products.Create)
	protected.Get("/products/:id", products.Get)
	protected.Patch("/products/:id", products.Update)
	protected.Delete("/products/:id", products.Delete)
	protected.Post("/products/:id/images", products.UploadImage)
	protected.Delete("/products/:id/images/:imageId", products.DeleteImage)

	// Companies CRUD
	protected.Get("/companies", companies.List)
	protected.Post("/companies", companies.Create)
	protected.Get("/companies/:id", companies.Get)
	protected.Patch("/companies/:id", companies.Update)
	protected.Delete("/companies/:id", companies.Delete)

	// Brands CRUD
	protected.Get("/brands", brands.List)
	protected.Post("/brands", brands.Create)
	protected.Get("/brands/:id", brands.Get)
	protected.Patch("/brands/:id", brands.Update)
	protected.Delete("/brands/:id", brands.Delete)
	protected.Post("/brands/:id/logo", brands.UploadLogo)

	// Promo banners CRUD
	protected.Get("/banners", banners.AdminList)
	protected.Post("/banners", banners.Create)
	protected.Patch("/banners/:id", banners.Update)
	protected.Delete("/banners/:id", banners.Delete)

	// Inline content images (rich-text product description editor)
	protected.Post("/content-images", contentImages.Upload)

	// Distributors CRUD
	protected.Get("/distributors", distributors.List)
	protected.Post("/distributors", distributors.Create)
	protected.Get("/distributors/:id", distributors.Get)
	protected.Patch("/distributors/:id", distributors.Update)
	protected.Delete("/distributors/:id", distributors.Delete)

	protected.Get("/analytics/summary", adminExtra.Summary)
	protected.Get("/analytics/frauds", adminExtra.FraudList)
	protected.Get("/analytics/geo", adminExtra.GeoAnalytics)
	protected.Get("/analytics/trend", adminExtra.ScanTrend)
	protected.Get("/analytics/devices", adminExtra.DeviceBreakdown)
	protected.Get("/analytics/scan-log", adminExtra.ScanLog)

	protected.Get("/customers", adminExtra.ListCustomers)
	protected.Get("/customers/export", adminExtra.ExportCustomers)
	protected.Get("/customers/:id", adminExtra.GetCustomer)
	protected.Put("/customers/:id", adminExtra.UpdateCustomer)

	protected.Get("/audit", adminExtra.AuditList)

	// Label templates (print export)
	protected.Post("/templates", templates.Create)
	protected.Get("/templates", templates.List)
	protected.Get("/templates/:id", templates.Get)
	protected.Patch("/templates/:id", templates.Update)
	protected.Put("/templates/:id", templates.UpdateFull)
	protected.Put("/templates/:id/print-settings", templates.SavePrintSettings)
	protected.Delete("/templates/:id", templates.Delete)
	protected.Get("/templates/:id/preview", templates.Preview)
	protected.Get("/templates/:id/barcode-preview", templates.BarcodePreview)
	protected.Get("/templates/:id/text-metrics", templates.TextMetrics)
	protected.Post("/templates/:id/cutline", templates.UploadCutline)

	// Saved GS1 object-position layouts (reuse a finished arrangement on another template)
	protected.Get("/label-layout-presets", labelLayoutPresets.List)
	protected.Post("/label-layout-presets", labelLayoutPresets.Create)
	protected.Delete("/label-layout-presets/:id", labelLayoutPresets.Delete)

	// "Buy more" orders placed by consumers from the GS1 verify page
	protected.Get("/orders", orders.List)
	protected.Get("/orders/:id", orders.Get)
	protected.Patch("/orders/:id/status", orders.UpdateStatus)
	protected.Delete("/orders/:id", orders.Delete)

	// Global system settings (scan-limit locking for QR / GS1 codes)
	protected.Get("/settings/scan-limits", settings.GetScanLimits)
	protected.Put("/settings/scan-limits", settings.UpdateScanLimits)

	// Voucher lookup — cross-check codes customers present against QR/GS1 issuance
	protected.Get("/vouchers", vouchers.List)

	addr := ":" + strings.TrimPrefix(cfg.AppPort, ":")
	fmt.Printf("🚀 TrustQR API listening on %s (env=%s)\n", addr, cfg.AppEnv)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
