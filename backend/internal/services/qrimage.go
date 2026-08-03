package services

import (
	"bytes"
	"image"
	"image/color"
	"image/png"

	qrcode "github.com/skip2/go-qrcode"
)

// qrQuietZoneModules is the blank-module margin left on each side of the QR
// code. The QR spec's default quiet zone is 4 modules; we use a thinner
// margin so the code fills more of its allotted box on printed labels while
// staying within commonly accepted scan-safe practice.
const qrQuietZoneModules = 2

// GenerateQRPNG returns PNG bytes for the given URL at pixelSize x pixelSize.
// pixelSize is the target image side length in pixels; recommend >= 256 for print.
func GenerateQRPNG(url string, pixelSize int) ([]byte, error) {
	// RecoveryLevel Medium is a good balance for printing (allows ~15% damage tolerance).
	q, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	q.DisableBorder = true
	bitmap := q.Bitmap()
	moduleCount := len(bitmap)
	totalModules := moduleCount + 2*qrQuietZoneModules

	img := image.NewGray(image.Rect(0, 0, pixelSize, pixelSize))
	modulesPerPixel := float64(totalModules) / float64(pixelSize)
	for y := 0; y < pixelSize; y++ {
		my := int(float64(y)*modulesPerPixel) - qrQuietZoneModules
		for x := 0; x < pixelSize; x++ {
			mx := int(float64(x)*modulesPerPixel) - qrQuietZoneModules
			v := color.Gray{Y: 255}
			if mx >= 0 && mx < moduleCount && my >= 0 && my < moduleCount && bitmap[my][mx] {
				v = color.Gray{Y: 0}
			}
			img.SetGray(x, y, v)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
