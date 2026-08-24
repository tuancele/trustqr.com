package handlers

import (
	"bytes"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

const maxUploadImageBytes = 8 * 1024 * 1024

// detectImageFileType maps a filename extension to the stored file_type,
// returning "" if the extension is not one of the supported image types.
func detectImageFileType(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".png":
		return "png"
	case ".jpg", ".jpeg":
		return "jpg"
	default:
		return ""
	}
}

// readAndValidateImage reads an uploaded file, enforcing the shared size
// limit and decoding it to confirm it's a genuine PNG/JPEG (rejecting CMYK
// JPEGs, which most browsers can't render).
func readAndValidateImage(fh *multipart.FileHeader, fileType string) ([]byte, error) {
	if fh.Size <= 0 || fh.Size > maxUploadImageBytes {
		return nil, errFileTooLarge
	}
	src, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxUploadImageBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxUploadImageBytes {
		return nil, errFileTooLarge
	}

	switch fileType {
	case "png":
		if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
			return nil, errInvalidPNG
		}
	case "jpg":
		cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return nil, errInvalidJPEG
		}
		if cfg.ColorModel == color.CMYKModel {
			return nil, errCMYKJPEG
		}
	}
	return data, nil
}

// saveImageFile writes validated image bytes to storageDir under a fresh
// UUID-derived filename and returns the full path on disk.
func saveImageFile(storageDir, fileType string, data []byte) (string, error) {
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		return "", err
	}
	storedName := uuid.NewString() + "." + fileType
	fullPath := filepath.Join(storageDir, storedName)
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", err
	}
	return fullPath, nil
}

// nullIfEmptyString returns nil for an empty string so it's stored as SQL
// NULL instead of an empty text value.
func nullIfEmptyString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

const maxUploadDocBytes = 15 * 1024 * 1024

// readAndValidatePDF reads an uploaded file, enforcing a size cap and
// confirming it's a genuine PDF via its magic-number header, so the module
// can't end up serving an arbitrary renamed file to consumers as a "document".
func readAndValidatePDF(fh *multipart.FileHeader) ([]byte, error) {
	if fh.Size <= 0 || fh.Size > maxUploadDocBytes {
		return nil, errFileTooLarge
	}
	if strings.ToLower(filepath.Ext(fh.Filename)) != ".pdf" {
		return nil, errUnsupportedFileType
	}
	src, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxUploadDocBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxUploadDocBytes {
		return nil, errFileTooLarge
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return nil, errInvalidPDF
	}
	return data, nil
}

type uploadError string

func (e uploadError) Error() string { return string(e) }

const (
	errFileTooLarge        uploadError = "file_too_large"
	errInvalidPNG          uploadError = "invalid_png"
	errInvalidJPEG         uploadError = "invalid_jpeg"
	errCMYKJPEG            uploadError = "cmyk_jpeg_unsupported"
	errUnsupportedFileType uploadError = "unsupported_file_type"
	errInvalidPDF          uploadError = "invalid_pdf"
)
