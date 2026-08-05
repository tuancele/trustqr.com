package handlers

import (
	"os"
	"path/filepath"
	"regexp"

	"github.com/gofiber/fiber/v2"

	"trustqr/backend/internal/middleware"
	"trustqr/backend/internal/services"
)

// ContentImageHandler serves images embedded inline in rich-text content
// (e.g. product full_description) via the admin editor. Unlike product
// gallery images, these aren't tied to a product ID — the editor needs to
// upload images before a new product has been saved — so files are just
// UUID-named on disk with no DB row to manage.
type ContentImageHandler struct {
	Audit      *services.AuditLogger
	StorageDir string
}

// contentImageFilenameRE matches exactly what saveImageFile produces
// (UUID + extension), rejecting anything else to prevent path traversal.
var contentImageFilenameRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg)$`)

// -------- ADMIN: Upload --------

func (h *ContentImageHandler) Upload(c *fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "file_required"})
	}
	fileType := detectImageFileType(fh.Filename)
	if fileType == "" {
		return c.Status(400).JSON(fiber.Map{"error": "unsupported_file_type"})
	}
	data, err := readAndValidateImage(fh, fileType)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	fullPath, err := saveImageFile(h.StorageDir, fileType, data)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "file_write"})
	}

	adminID, _ := c.Locals(middleware.CtxAdminID).(int64)
	filename := filepath.Base(fullPath)
	h.Audit.Log(adminID, "content_image.upload", "content_image", filename, nil,
		middleware.ClientIP(c), c.Get("User-Agent"))
	return c.Status(201).JSON(fiber.Map{"url": "/api/v1/content-images/" + filename})
}

// -------- PUBLIC: Serve --------

func (h *ContentImageHandler) Serve(c *fiber.Ctx) error {
	filename := c.Params("filename")
	if !contentImageFilenameRE.MatchString(filename) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_filename"})
	}

	data, err := os.ReadFile(filepath.Join(h.StorageDir, filename))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not_found"})
	}

	switch filepath.Ext(filename) {
	case ".png":
		c.Set("Content-Type", "image/png")
	case ".jpg":
		c.Set("Content-Type", "image/jpeg")
	}
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Send(data)
}
