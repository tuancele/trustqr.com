package services

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"github.com/go-pdf/fpdf"
)

// LabelToken is one QR code to be placed on the print sheet / SVG output.
type LabelToken struct {
	Code string
	URL  string
}

// GridSpec describes how many label cells fit on one sheet.
type GridSpec struct {
	Cols int
	Rows int
}

// SheetPresets maps a preset name to {width_mm, height_mm} in portrait orientation.
var SheetPresets = map[string][2]float64{
	"A4":      {210, 297},
	"A3":      {297, 420},
	"A5":      {148, 210},
	"Letter":  {215.9, 279.4},
	"33x48cm": {330, 480},
}

// GridLayout computes how many labelW x labelH cells (mm) fit on a sheetW x sheetH
// sheet (mm), given a uniform margin around the sheet and a gutter between cells.
// Returns an error if the label does not fit at all (e.g. bigger than the sheet).
func GridLayout(sheetW, sheetH, margin, gutter, labelW, labelH float64) (GridSpec, error) {
	usableW := sheetW - 2*margin
	usableH := sheetH - 2*margin
	if usableW <= 0 || usableH <= 0 {
		return GridSpec{}, fmt.Errorf("margin_too_large: %.1fmm margin leaves no usable area on %.0fx%.0fmm sheet", margin, sheetW, sheetH)
	}
	cols := int((usableW + gutter) / (labelW + gutter))
	rows := int((usableH + gutter) / (labelH + gutter))
	if cols < 1 || rows < 1 {
		return GridSpec{}, fmt.Errorf("label_does_not_fit: label %.0fx%.0fmm does not fit sheet %.0fx%.0fmm with %.1fmm margin", labelW, labelH, sheetW, sheetH, margin)
	}
	return GridSpec{Cols: cols, Rows: rows}, nil
}

// RenderTiledPDF builds a print-ready PDF with one page per sheet, tiling the
// template image with a barcode image composited at (qrXRatio,qrYRatio) with a
// square side of (qrSizeRatio * labelW) — a fraction of labelW, matching the
// same fixed-square QR box used everywhere else — into every grid cell, one
// cell per token. imageFn supplies the PNG bytes to place for each token,
// which lets callers plug in QR codes, GS1 DataMatrix, or any other raster
// barcode without duplicating the tiling/pagination logic.
//
// The template image is registered once with fpdf and reused for every cell/page
// (fpdf embeds identically-named images only once), so PDF size and memory stay
// roughly proportional to the number of *distinct* barcode images, not the page count.
func RenderTiledPDF(templatePath, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error)) ([]byte, error) {
	grid, err := GridLayout(sheetW, sheetH, margin, gutter, labelW, labelH)
	if err != nil {
		return nil, err
	}

	orientation := "P"
	if sheetW > sheetH {
		orientation = "L"
	}

	pdf := fpdf.New(orientation, "mm", "", "")
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)

	tplFile, err := os.Open(templatePath)
	if err != nil {
		return nil, fmt.Errorf("open template: %w", err)
	}
	defer tplFile.Close()

	imgType := strings.ToUpper(templateType)
	if imgType == "JPG" {
		imgType = "JPEG"
	}
	imgOpts := fpdf.ImageOptions{ImageType: imgType}
	pdf.RegisterImageOptionsReader("tpl", imgOpts, tplFile)
	if pdf.Err() {
		return nil, fmt.Errorf("register template image: %v", pdf.Error())
	}

	qrSide := qrSizeRatio * labelW
	qrOffsetX := qrXRatio * labelW
	qrOffsetY := qrYRatio * labelH
	qrOpts := fpdf.ImageOptions{ImageType: "PNG"}

	perPage := grid.Cols * grid.Rows
	pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})
		}
		posInPage := i % perPage
		col := posInPage % grid.Cols
		row := posInPage / grid.Cols
		cellX := margin + float64(col)*(labelW+gutter)
		cellY := margin + float64(row)*(labelH+gutter)

		pdf.ImageOptions("tpl", cellX, cellY, labelW, labelH, false, imgOpts, 0, "")

		qrPNG, err := imageFn(tok)
		if err != nil {
			return nil, fmt.Errorf("generate image for %s: %w", tok.Code, err)
		}
		qrName := "qr_" + tok.Code
		pdf.RegisterImageOptionsReader(qrName, qrOpts, bytes.NewReader(qrPNG))
		pdf.ImageOptions(qrName, cellX+qrOffsetX, cellY+qrOffsetY, qrSide, qrSide, false, qrOpts, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("pdf output: %w", err)
	}
	return buf.Bytes(), nil
}

// TextObjectConfig positions one human-readable text field on a GS1 label
// template. Field is a key into the fieldValues map passed to
// RenderTiledGS1PDF/InjectGS1ObjectsIntoSVG (gtin, lot, serial,
// manufacture_date, expiry_date, product_code, spec, size_spec). Multiple
// TextObjects may share the same Field (e.g. the serial is shown twice on
// one sticker, styled differently each time).
type TextObjectConfig struct {
	ID        string  `json:"id"`
	Field     string  `json:"field"`
	XRatio    float64 `json:"x_ratio"`
	YRatio    float64 `json:"y_ratio"`
	SizeRatio float64 `json:"size_ratio"`
	Bold      bool    `json:"bold"`
	Rotate180 bool    `json:"rotate_180"`
}

// GS1Layout groups the position ratios for the extra objects a GS1 label
// template composites alongside the QR: a Code128 barcode (independent
// width/height ratios, since unlike QR it isn't square-locked) and an
// arbitrary list of positioned text fields.
type GS1Layout struct {
	BarcodeXRatio, BarcodeYRatio, BarcodeWRatio, BarcodeHRatio float64
	TextObjects                                                []TextObjectConfig
}

const mmToPt = 2.834645669

// RenderTiledGS1PDF is RenderTiledPDF plus a barcode image and the
// template's positioned text objects composited into every cell. Unlike the
// per-unit QR, the barcode/text are the same for every physical copy in a
// print run (a GS1 label's fields are defined once, at the label level), so
// they're registered/drawn once and reused across cells the same way the
// template image itself is. fieldValues supplies the human-readable string
// for each TextObjectConfig.Field; objects whose field has no value (empty
// string or missing key) are skipped.
func RenderTiledGS1PDF(templatePath, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, layout GS1Layout, fieldValues map[string]string, barcodePNG []byte, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error)) ([]byte, error) {
	grid, err := GridLayout(sheetW, sheetH, margin, gutter, labelW, labelH)
	if err != nil {
		return nil, err
	}

	orientation := "P"
	if sheetW > sheetH {
		orientation = "L"
	}

	pdf := fpdf.New(orientation, "mm", "", "")
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)

	tplFile, err := os.Open(templatePath)
	if err != nil {
		return nil, fmt.Errorf("open template: %w", err)
	}
	defer tplFile.Close()

	imgType := strings.ToUpper(templateType)
	if imgType == "JPG" {
		imgType = "JPEG"
	}
	imgOpts := fpdf.ImageOptions{ImageType: imgType}
	pdf.RegisterImageOptionsReader("tpl", imgOpts, tplFile)
	if pdf.Err() {
		return nil, fmt.Errorf("register template image: %v", pdf.Error())
	}

	barcodeOpts := fpdf.ImageOptions{ImageType: "PNG"}
	pdf.RegisterImageOptionsReader("barcode", barcodeOpts, bytes.NewReader(barcodePNG))
	if pdf.Err() {
		return nil, fmt.Errorf("register barcode image: %v", pdf.Error())
	}

	qrSide := qrSizeRatio * labelW
	qrOffsetX := qrXRatio * labelW
	qrOffsetY := qrYRatio * labelH
	qrOpts := fpdf.ImageOptions{ImageType: "PNG"}

	barcodeX := layout.BarcodeXRatio * labelW
	barcodeY := layout.BarcodeYRatio * labelH
	barcodeW := layout.BarcodeWRatio * labelW
	barcodeH := layout.BarcodeHRatio * labelH

	perPage := grid.Cols * grid.Rows
	pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})
		}
		posInPage := i % perPage
		col := posInPage % grid.Cols
		row := posInPage / grid.Cols
		cellX := margin + float64(col)*(labelW+gutter)
		cellY := margin + float64(row)*(labelH+gutter)

		pdf.ImageOptions("tpl", cellX, cellY, labelW, labelH, false, imgOpts, 0, "")
		pdf.ImageOptions("barcode", cellX+barcodeX, cellY+barcodeY, barcodeW, barcodeH, false, barcodeOpts, 0, "")

		for _, obj := range layout.TextObjects {
			val := fieldValues[obj.Field]
			if val == "" {
				continue
			}
			sizeMM := obj.SizeRatio * labelW
			fontStyle := ""
			if obj.Bold {
				fontStyle = "B"
			}
			pdf.SetFont("Helvetica", fontStyle, sizeMM*mmToPt)
			// pdf.Text's y is the text baseline; adding the font's mm height
			// to the ratio-derived top offset approximates a top-left
			// anchor, so objects line up with the barcode/QR boxes the same
			// way the position editor shows them (top-left origin).
			tx := cellX + obj.XRatio*labelW
			ty := cellY + obj.YRatio*labelH + sizeMM
			if obj.Rotate180 {
				cx := tx + pdf.GetStringWidth(val)/2
				cy := ty - sizeMM/2
				pdf.TransformBegin()
				pdf.TransformRotate(180, cx, cy)
				pdf.Text(tx, ty, val)
				pdf.TransformEnd()
			} else {
				pdf.Text(tx, ty, val)
			}
		}

		qrPNG, err := imageFn(tok)
		if err != nil {
			return nil, fmt.Errorf("generate image for %s: %w", tok.Code, err)
		}
		qrName := "qr_" + tok.Code
		pdf.RegisterImageOptionsReader(qrName, qrOpts, bytes.NewReader(qrPNG))
		pdf.ImageOptions(qrName, cellX+qrOffsetX, cellY+qrOffsetY, qrSide, qrSide, false, qrOpts, 0, "")
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("pdf output: %w", err)
	}
	return buf.Bytes(), nil
}

// InjectQRIntoSVG returns a copy of svgBytes with a base64-embedded QR <image>
// element inserted just before the closing </svg> tag. Position/size are
// expressed as SVG percentages (relative to the SVG viewport), which sidesteps
// having to parse the template's own viewBox/width/height units.
//
// sizeRatio is the QR box's square side as a fraction of the template's own
// width (widthMM). Because SVG width%/height% resolve against the viewport's
// width and height independently, a physically-square box needs converting
// through the template's real mm dimensions so it renders as a square (not
// stretched) when widthMM != heightMM.
func InjectQRIntoSVG(svgBytes, qrPNG []byte, xRatio, yRatio, sizeRatio, widthMM, heightMM float64) ([]byte, error) {
	const closeTag = "</svg>"
	idx := bytes.LastIndex(svgBytes, []byte(closeTag))
	if idx == -1 {
		return nil, fmt.Errorf("invalid_svg: no closing </svg> tag found")
	}

	sideMM := sizeRatio * widthMM
	widthPct := sizeRatio * 100
	heightPct := widthPct
	if heightMM > 0 {
		heightPct = sideMM / heightMM * 100
	}

	b64 := base64.StdEncoding.EncodeToString(qrPNG)
	imageEl := fmt.Sprintf(
		`<image x="%.4f%%" y="%.4f%%" width="%.4f%%" height="%.4f%%" href="data:image/png;base64,%s" preserveAspectRatio="none"/>`,
		xRatio*100, yRatio*100, widthPct, heightPct, b64,
	)

	out := make([]byte, 0, len(svgBytes)+len(imageEl))
	out = append(out, svgBytes[:idx]...)
	out = append(out, imageEl...)
	out = append(out, svgBytes[idx:]...)
	return out, nil
}

// InjectGS1ObjectsIntoSVG is InjectQRIntoSVG plus a barcode <image> and the
// template's positioned text objects, the SVG-export equivalent of
// RenderTiledGS1PDF's compositing for GS1-flagged templates. Text
// position/size use the same percentage-of-viewport convention as the image
// elements (per the SVG spec, percentage lengths on properties like
// font-size resolve against the viewport's normalized diagonal), so it stays
// consistent with the rest of this file's resolution-independent approach.
// fieldValues supplies the human-readable string for each
// TextObjectConfig.Field; objects whose field has no value are skipped.
func InjectGS1ObjectsIntoSVG(svgBytes, qrPNG, barcodePNG []byte, qrXRatio, qrYRatio, qrSizeRatio float64, layout GS1Layout, fieldValues map[string]string, widthMM, heightMM float64) ([]byte, error) {
	const closeTag = "</svg>"
	idx := bytes.LastIndex(svgBytes, []byte(closeTag))
	if idx == -1 {
		return nil, fmt.Errorf("invalid_svg: no closing </svg> tag found")
	}

	qrSideMM := qrSizeRatio * widthMM
	qrWidthPct := qrSizeRatio * 100
	qrHeightPct := qrWidthPct
	if heightMM > 0 {
		qrHeightPct = qrSideMM / heightMM * 100
	}

	var els bytes.Buffer
	fmt.Fprintf(&els, `<image x="%.4f%%" y="%.4f%%" width="%.4f%%" height="%.4f%%" href="data:image/png;base64,%s" preserveAspectRatio="none"/>`,
		qrXRatio*100, qrYRatio*100, qrWidthPct, qrHeightPct, base64.StdEncoding.EncodeToString(qrPNG))
	fmt.Fprintf(&els, `<image x="%.4f%%" y="%.4f%%" width="%.4f%%" height="%.4f%%" href="data:image/png;base64,%s" preserveAspectRatio="none"/>`,
		layout.BarcodeXRatio*100, layout.BarcodeYRatio*100, layout.BarcodeWRatio*100, layout.BarcodeHRatio*100, base64.StdEncoding.EncodeToString(barcodePNG))

	for _, obj := range layout.TextObjects {
		val := fieldValues[obj.Field]
		if val == "" {
			continue
		}
		fontWeight := "normal"
		if obj.Bold {
			fontWeight = "bold"
		}
		var transform string
		if obj.Rotate180 {
			transform = fmt.Sprintf(` transform="rotate(180, %.4f%%, %.4f%%)"`, obj.XRatio*100, obj.YRatio*100)
		}
		fmt.Fprintf(&els, `<text x="%.4f%%" y="%.4f%%" font-size="%.4f%%" font-family="Arial, Helvetica, sans-serif" font-weight="%s" dominant-baseline="hanging"%s>%s</text>`,
			obj.XRatio*100, obj.YRatio*100, obj.SizeRatio*100, fontWeight, transform, escapeXMLText(val))
	}

	out := make([]byte, 0, len(svgBytes)+els.Len())
	out = append(out, svgBytes[:idx]...)
	out = append(out, els.Bytes()...)
	out = append(out, svgBytes[idx:]...)
	return out, nil
}

func escapeXMLText(s string) string {
	var buf bytes.Buffer
	_ = xml.EscapeText(&buf, []byte(s))
	return buf.String()
}

var svgDangerousPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`),
	regexp.MustCompile(`(?is)<script[^>]*/\s*>`),
	regexp.MustCompile(`(?is)<foreignobject[^>]*>.*?</foreignobject>`),
	regexp.MustCompile(`(?is)<foreignobject[^>]*/\s*>`),
	regexp.MustCompile(`(?i)\son\w+\s*=\s*"[^"]*"`),
	regexp.MustCompile(`(?i)\son\w+\s*=\s*'[^']*'`),
}

// SanitizeSVG validates that input is well-formed XML (Go's encoding/xml never
// resolves external entities or DTDs, so this parse step is XXE-safe by
// construction) and strips known script-execution vectors (<script>,
// <foreignObject>, on*="" event handler attributes) before the file is stored
// on disk. This matters because templates are later served back with
// Content-Type: image/svg+xml, and a browser opening that URL directly (not
// via an <img> tag) would otherwise execute embedded scripts.
func SanitizeSVG(input []byte) ([]byte, error) {
	dec := xml.NewDecoder(bytes.NewReader(input))
	for {
		_, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("invalid_svg_xml: %w", err)
		}
	}

	out := input
	for _, re := range svgDangerousPatterns {
		out = re.ReplaceAll(out, nil)
	}
	return out, nil
}
