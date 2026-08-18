package services

import (
	"bytes"
	"fmt"
	"image"
	"image/png"

	"github.com/boombuler/barcode/code128"
)

// GenerateBarcodePNG returns PNG bytes for a 1D Code128 barcode encoding
// data (the GS1 label's raw serial value, AI 21 — not GS1-128/AI-prefixed),
// stretched to fill exactly widthPx x heightPx with no blank margin baked
// into the image content.
//
// We deliberately do not use barcode.Scale from boombuler/barcode: its 1D
// scaler computes an integer pixel-per-module factor via truncating
// division and centers the result in the canvas, which leaves a blank
// margin on both sides whose size depends on how evenly widthPx divides
// into the module count — sometimes a few px, sometimes a large fraction
// of the image. Since the editor's live preview (12 px/mm) and the PDF/SVG
// export (300 DPI) request different pixel widths for the same saved
// ratio, that truncation could produce a different-looking margin in each
// place, breaking WYSIWYG between the position editor and the exported
// label. Stretching every module to fill the canvas exactly keeps the
// visible barcode identical to the box the admin drew, everywhere it's
// rendered.
func GenerateBarcodePNG(data string, widthPx, heightPx int) ([]byte, error) {
	bc, err := code128.Encode(data)
	if err != nil {
		return nil, err
	}
	bounds := bc.Bounds()
	orgWidth := bounds.Max.X - bounds.Min.X
	if orgWidth <= 0 {
		return nil, fmt.Errorf("barcode has no modules")
	}

	img := image.NewGray(image.Rect(0, 0, widthPx, heightPx))
	for x := 0; x < widthPx; x++ {
		srcX := x * orgWidth / widthPx
		if srcX >= orgWidth {
			srcX = orgWidth - 1
		}
		col := bc.At(srcX, 0)
		for y := 0; y < heightPx; y++ {
			img.Set(x, y, col)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
