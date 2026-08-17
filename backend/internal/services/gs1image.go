package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"time"
)

var gs1ImageHTTPClient = &http.Client{Timeout: 15 * time.Second}

// FetchGS1DataMatrixPNG renders a true GS1 DataMatrix (FNC1 + AI structure,
// with checksum validation) by calling the frontend's bwip-js-backed
// /api/gs1-datamatrix endpoint. Go has no in-process GS1/FNC1 DataMatrix
// encoder, and re-implementing GS1 AI encoding independently here would risk
// producing a barcode that decodes differently from what the admin already
// previewed in-browser — so print export reuses that exact same renderer.
func FetchGS1DataMatrixPNG(baseURL, elementString string, scale int) ([]byte, error) {
	u := fmt.Sprintf("%s/api/gs1-datamatrix?%s", baseURL, url.Values{
		"data":  {elementString},
		"scale": {fmt.Sprintf("%d", scale)},
	}.Encode())

	resp, err := gs1ImageHTTPClient.Get(u)
	if err != nil {
		return nil, fmt.Errorf("gs1_datamatrix_unreachable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gs1_datamatrix_read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error  string `json:"error"`
			Detail string `json:"detail"`
		}
		if json.Unmarshal(body, &e) == nil && e.Error != "" {
			if e.Detail != "" {
				return nil, fmt.Errorf("%s: %s", e.Error, e.Detail)
			}
			return nil, fmt.Errorf("%s", e.Error)
		}
		return nil, fmt.Errorf("gs1_datamatrix_render_failed: status %d", resp.StatusCode)
	}
	return body, nil
}

// ComposeGS1LabelImage places the GS1 DataMatrix and a consumer-facing
// verification QR (encoding verifyURL) side by side on a single square
// canvas. The canvas must be square: print export composites this one image
// into a fixed qrSide x qrSide box (labelrender.go), and a non-square source
// would get stretched unevenly, distorting both barcodes. The verify QR is
// generated at the DataMatrix's own pixel height so no rescaling is needed —
// only placement — keeping both codes crisp.
func ComposeGS1LabelImage(dmPNG []byte, verifyURL string) ([]byte, error) {
	dmImg, err := png.Decode(bytes.NewReader(dmPNG))
	if err != nil {
		return nil, fmt.Errorf("decode datamatrix png: %w", err)
	}
	side := dmImg.Bounds().Dy()

	qrPNG, err := GenerateQRPNG(verifyURL, side)
	if err != nil {
		return nil, fmt.Errorf("generate verify qr: %w", err)
	}
	qrImg, err := png.Decode(bytes.NewReader(qrPNG))
	if err != nil {
		return nil, fmt.Errorf("decode verify qr png: %w", err)
	}

	gap := side / 8
	canvasSide := side*2 + gap
	dst := image.NewRGBA(image.Rect(0, 0, canvasSide, canvasSide))
	draw.Draw(dst, dst.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	yOff := (canvasSide - side) / 2
	draw.Draw(dst, image.Rect(0, yOff, side, yOff+side), dmImg, dmImg.Bounds().Min, draw.Over)
	draw.Draw(dst, image.Rect(side+gap, yOff, side+gap+side, yOff+side), qrImg, qrImg.Bounds().Min, draw.Over)

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, fmt.Errorf("encode composite png: %w", err)
	}
	return buf.Bytes(), nil
}
