package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"

	"trustqr/backend/internal/services"
)

// ExportBatchZIP returns a ZIP file with:
//   - qr_images/<code>.png : one QR image per token
//   - manifest.csv         : mapping filename -> secret_code + full_url
func (h *AdminHandler) ExportBatchZIP(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}

	pixel := 320
	if p := c.Query("px"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n >= 128 && n <= 1024 {
			pixel = n
		}
	}

	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Minute)
	defer cancel()

	rows, err := h.DB.Query(ctx, `SELECT secret_code FROM qr_tokens WHERE batch_id=$1 ORDER BY id`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "query"})
	}
	defer rows.Close()

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// Manifest
	manifestBuf := &bytes.Buffer{}
	cw := csv.NewWriter(manifestBuf)
	cw.Write([]string{"filename", "secret_code", "full_url"})

	count := 0
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			continue
		}
		url := fmt.Sprintf("%s/v/%s", h.PublicBaseURL, code)
		png, err := services.GenerateQRPNG(url, pixel)
		if err != nil {
			continue
		}
		filename := "qr_images/" + code + ".png"
		fw, err := zw.Create(filename)
		if err != nil {
			continue
		}
		fw.Write(png)
		cw.Write([]string{filename, code, url})
		count++
	}
	cw.Flush()

	mfw, _ := zw.Create("manifest.csv")
	mfw.Write(manifestBuf.Bytes())
	zw.Close()

	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="batch_%d_qr.zip"`, id))
	return c.Send(buf.Bytes())
}

// GetQRImage returns a single QR code as PNG for the given secret_code.
func (h *AdminHandler) GetQRImage(c *fiber.Ctx) error {
	code := c.Params("code")
	pixel := 320
	if p := c.Query("px"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n >= 128 && n <= 1024 {
			pixel = n
		}
	}
	url := fmt.Sprintf("%s/v/%s", h.PublicBaseURL, code)
	png, err := services.GenerateQRPNG(url, pixel)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "qr_gen"})
	}
	c.Set("Content-Type", "image/png")
	return c.Send(png)
}
