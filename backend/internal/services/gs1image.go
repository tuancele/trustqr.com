package services

import (
	"encoding/json"
	"fmt"
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
