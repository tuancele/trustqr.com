package services

import (
	"bytes"
	"image/png"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
)

// GenerateBarcodePNG returns PNG bytes for a 1D Code128 barcode encoding
// data (the GS1 label's raw serial value, AI 21 — not GS1-128/AI-prefixed),
// scaled to widthPx x heightPx.
func GenerateBarcodePNG(data string, widthPx, heightPx int) ([]byte, error) {
	bc, err := code128.Encode(data)
	if err != nil {
		return nil, err
	}
	scaled, err := barcode.Scale(bc, widthPx, heightPx)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
