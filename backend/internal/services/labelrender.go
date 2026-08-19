package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
)

// LabelToken is one QR code to be placed on the print sheet / SVG output.
// Serial is only populated for GS1 exports, where each physical unit needs
// its own AI 21 Serial Number value (see RenderTiledGS1PDF).
type LabelToken struct {
	Code   string
	URL    string
	Serial string
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

// rasterCanvasGray is the fill color RasterizeSVG paints behind the parsed
// SVG before drawing it. It is deliberately not white: a template's own
// white-filled shapes (die-cut/kiss-cut guide shapes in particular, which
// are legitimately drawn with fill:#fff since they carry no ink) would
// otherwise be indistinguishable from an also-white canvas in the exported
// raster/PDF, hiding the template's true silhouette.
var rasterCanvasGray = color.RGBA{R: 200, G: 200, B: 200, A: 255}

// addGrayPage adds a new sheetW x sheetH page and fills it with
// rasterCanvasGray before any label images are placed, so the sheet's own
// margin/gutter area (outside every placed label image) matches the gray
// RasterizeSVG now paints behind each label's own template — otherwise the
// page background would stay white while the dead space inside each label
// image is gray, which defeats the point of using gray to make a label's
// true silhouette (and any white die-cut shapes on it) stand out.
func addGrayPage(pdf *fpdf.Fpdf, orientation string, sheetW, sheetH float64) {
	pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})
	pdf.SetFillColor(int(rasterCanvasGray.R), int(rasterCanvasGray.G), int(rasterCanvasGray.B))
	pdf.Rect(0, 0, sheetW, sheetH, "F")
}

// RasterizeSVG rasterizes svgBytes onto an opaque gray (see rasterCanvasGray)
// widthPx x heightPx canvas (stretching non-uniformly to fill the target
// exactly, matching how the rest of the label pipeline treats an admin-set
// width_mm/height_mm as authoritative over whatever aspect ratio the source
// file happens to have) and returns the result PNG-encoded. Used to turn an
// SVG label template into a template image RenderTiledPDF/RenderTiledGS1PDF
// can tile, since Go has no in-process SVG->PDF vector converter — rendering
// at a high enough pixel density keeps the tiled PDF sharp at normal print
// sizes.
func RasterizeSVG(svgBytes []byte, widthPx, heightPx int) ([]byte, error) {
	icon, err := oksvg.ReadIconStream(bytes.NewReader(svgBytes))
	if err != nil {
		return nil, fmt.Errorf("parse svg: %w", err)
	}
	if icon.ViewBox.W <= 0 || icon.ViewBox.H <= 0 {
		return nil, fmt.Errorf("svg has no usable viewBox/width-height")
	}
	icon.SetTarget(0, 0, float64(widthPx), float64(heightPx))

	img := image.NewRGBA(image.Rect(0, 0, widthPx, heightPx))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: rasterCanvasGray}, image.Point{}, draw.Src)

	scanner := rasterx.NewScannerGV(widthPx, heightPx, img, img.Bounds())
	dasher := rasterx.NewDasher(widthPx, heightPx, scanner)
	icon.DrawToTarget(dasher, img, 1.0)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
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
func RenderTiledPDF(templateSrc io.Reader, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error)) ([]byte, error) {
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

	imgType := strings.ToUpper(templateType)
	if imgType == "JPG" {
		imgType = "JPEG"
	}
	imgOpts := fpdf.ImageOptions{ImageType: imgType}
	pdf.RegisterImageOptionsReader("tpl", imgOpts, templateSrc)
	if pdf.Err() {
		return nil, fmt.Errorf("register template image: %v", pdf.Error())
	}

	qrSide := qrSizeRatio * labelW
	qrOffsetX := qrXRatio * labelW
	qrOffsetY := qrYRatio * labelH
	qrOpts := fpdf.ImageOptions{ImageType: "PNG"}

	perPage := grid.Cols * grid.Rows
	addGrayPage(pdf, orientation, sheetW, sheetH)

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			addGrayPage(pdf, orientation, sheetW, sheetH)
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

// Weight values a TextObjectConfig can request. Regular/Bold map to fpdf's
// two real Helvetica font programs; ExtraBold has no real font program
// available (fpdf ships no true Extra Bold/Black weight) and is instead
// faked at draw time.
const (
	WeightRegular   = "regular"
	WeightBold      = "bold"
	WeightExtraBold = "extrabold"
)

// TextObjectConfig positions one human-readable text field on a GS1 label
// template. Field is a key into the GS1FieldValues passed to
// RenderTiledGS1PDF/InjectGS1ObjectsIntoSVG (gtin, lot, serial,
// manufacture_date, expiry_date, product_code, spec, size_spec). Multiple
// TextObjects may share the same Field (e.g. the serial is shown twice on
// one sticker, styled differently each time). DateFormat only applies to
// the two date fields ("yymmdd" e.g. 260817, or "iso" e.g. 2026-08-17);
// it's ignored for every other field.
type TextObjectConfig struct {
	ID         string  `json:"id"`
	Field      string  `json:"field"`
	XRatio     float64 `json:"x_ratio"`
	YRatio     float64 `json:"y_ratio"`
	SizeRatio  float64 `json:"size_ratio"`
	Weight     string  `json:"weight"`
	Rotate180  bool    `json:"rotate_180"`
	DateFormat string  `json:"date_format,omitempty"`
}

// UnmarshalJSON keeps pre-existing JSONB rows readable after Bold bool was
// replaced by Weight string: a row with no "weight" key falls back to its
// old "bold" boolean (true -> bold, false/absent -> regular).
func (t *TextObjectConfig) UnmarshalJSON(data []byte) error {
	type alias TextObjectConfig
	aux := struct {
		Bold *bool `json:"bold"`
		*alias
	}{alias: (*alias)(t)}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	if t.Weight == "" {
		if aux.Bold != nil && *aux.Bold {
			t.Weight = WeightBold
		} else {
			t.Weight = WeightRegular
		}
	}
	return nil
}

// GS1FieldValues supplies the resolved value for every TextObjectConfig
// on a label. Dates are kept as time.Time rather than pre-formatted
// strings so each positioned text object can independently choose its own
// DateFormat (e.g. one manufacture-date object shown as "260817", another
// as "2026-08-17").
type GS1FieldValues struct {
	Fields          map[string]string
	ManufactureDate time.Time
	ExpiryDate      time.Time
}

func (fv GS1FieldValues) resolve(obj TextObjectConfig) string {
	switch obj.Field {
	case "manufacture_date":
		if fv.ManufactureDate.IsZero() {
			return ""
		}
		return formatGS1Date(fv.ManufactureDate, obj.DateFormat)
	case "expiry_date":
		if fv.ExpiryDate.IsZero() {
			return ""
		}
		return formatGS1Date(fv.ExpiryDate, obj.DateFormat)
	default:
		return fv.Fields[obj.Field]
	}
}

// formatGS1Date renders a date per the admin-selected display style.
// Unset/unrecognized formats default to "yymmdd", the compact form GS1
// AI 11/17 already encodes on-barcode.
func formatGS1Date(t time.Time, format string) string {
	if format == "iso" {
		return t.Format("2006-01-02")
	}
	return t.Format("060102")
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

// gs1UnicodeFallbacks maps characters that appear in real GS1 seed data
// (e.g. gs1_size_specs.size_spec = "3.7mm(⌀) x 8.0mm(L)") but have no cp1252
// codepoint at all, to the closest glyph cp1252 does have. fpdf's built-in
// Helvetica is a base-14 PDF core font limited to cp1252/WinAnsi — passing
// UTF-8 straight to pdf.Text() without this step corrupts every multi-byte
// rune into mojibake.
var gs1UnicodeFallbacks = strings.NewReplacer(
	"⌀", "Ø", // U+2300 DIAMETER SIGN -> Ø
	"∅", "Ø", // U+2205 EMPTY SET -> Ø
)

// gs1SanitizeText substitutes known cp1252-incompatible symbols and then
// runs fpdf's own cp1252 translator, so val is safe to hand to pdf.Text and
// pdf.GetStringWidth on a Helvetica core font.
func gs1SanitizeText(tr func(string) string, s string) string {
	return tr(gs1UnicodeFallbacks.Replace(s))
}

// RenderTiledGS1PDF is RenderTiledPDF plus a barcode image and the
// template's positioned text objects composited into every cell. GTIN/Lot/
// dates are the same for every physical copy in a print run (a GS1 batch's
// fields are defined once, at the label level), but the Serial (AI 21) must
// be unique per physical item — so gs1Fn resolves the barcode image and
// field values independently for each token, the same way imageFn already
// does for the per-unit QR.
func RenderTiledGS1PDF(templateSrc io.Reader, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, layout GS1Layout, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error), gs1Fn func(LabelToken) (GS1FieldValues, []byte, error)) ([]byte, error) {
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

	imgType := strings.ToUpper(templateType)
	if imgType == "JPG" {
		imgType = "JPEG"
	}
	imgOpts := fpdf.ImageOptions{ImageType: imgType}
	pdf.RegisterImageOptionsReader("tpl", imgOpts, templateSrc)
	if pdf.Err() {
		return nil, fmt.Errorf("register template image: %v", pdf.Error())
	}

	barcodeOpts := fpdf.ImageOptions{ImageType: "PNG"}
	textTr := pdf.UnicodeTranslatorFromDescriptor("")

	qrSide := qrSizeRatio * labelW
	qrOffsetX := qrXRatio * labelW
	qrOffsetY := qrYRatio * labelH
	qrOpts := fpdf.ImageOptions{ImageType: "PNG"}

	barcodeX := layout.BarcodeXRatio * labelW
	barcodeY := layout.BarcodeYRatio * labelH
	barcodeW := layout.BarcodeWRatio * labelW
	barcodeH := layout.BarcodeHRatio * labelH

	perPage := grid.Cols * grid.Rows
	addGrayPage(pdf, orientation, sheetW, sheetH)

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			addGrayPage(pdf, orientation, sheetW, sheetH)
		}
		posInPage := i % perPage
		col := posInPage % grid.Cols
		row := posInPage / grid.Cols
		cellX := margin + float64(col)*(labelW+gutter)
		cellY := margin + float64(row)*(labelH+gutter)

		pdf.ImageOptions("tpl", cellX, cellY, labelW, labelH, false, imgOpts, 0, "")

		fieldValues, barcodePNG, err := gs1Fn(tok)
		if err != nil {
			return nil, fmt.Errorf("resolve gs1 fields for %s: %w", tok.Code, err)
		}
		barcodeName := "barcode_" + tok.Code
		pdf.RegisterImageOptionsReader(barcodeName, barcodeOpts, bytes.NewReader(barcodePNG))
		pdf.ImageOptions(barcodeName, cellX+barcodeX, cellY+barcodeY, barcodeW, barcodeH, false, barcodeOpts, 0, "")

		for _, obj := range layout.TextObjects {
			val := fieldValues.resolve(obj)
			if val == "" {
				continue
			}
			val = gs1SanitizeText(textTr, val)
			sizeMM := obj.SizeRatio * labelW
			fontStyle := ""
			if obj.Weight == WeightBold || obj.Weight == WeightExtraBold {
				fontStyle = "B"
			}
			pdf.SetFont("Helvetica", fontStyle, sizeMM*mmToPt)
			// pdf.Text's y is the text baseline; Helvetica's cap height is
			// ~72% of its em size, so adding that fraction (not the full
			// em) of the font's mm size to the ratio-derived top offset
			// approximates a top-left anchor at the visible glyph top —
			// matching the SVG export's dominant-baseline="hanging" and the
			// position editor's top-left-anchored box.
			tx := cellX + obj.XRatio*labelW
			ty := cellY + obj.YRatio*labelH + sizeMM*gs1TextCapHeightRatio
			drawGS1Text(pdf, val, tx, ty, sizeMM, obj.Weight, obj.Rotate180)
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

// gs1ExtraBoldStrokeWidthMM is the PDF stroke width used to thicken
// WeightExtraBold glyphs via fill+stroke text rendering (PDF "Tr 2"). A
// stroke traces the true glyph outline, so it thickens diagonals and curves
// exactly as much as horizontals/verticals — unlike the old "poor man's
// bold" trick of redrawing the glyph at 4 offset copies, which only spreads
// ink along the horizontal/vertical axes and left visibly jagged, uneven
// edges on diagonal strokes.
const gs1ExtraBoldStrokeWidthMM = 0.15

// gs1TextCapHeightRatio approximates Helvetica's cap height as a fraction of
// its em size, used to convert the ratio-derived top-left anchor into the
// baseline y that pdf.Text expects (see RenderTiledGS1PDF) and to find the
// glyph's visual vertical center for 180-degree rotation below.
const gs1TextCapHeightRatio = 0.72

// MeasureGS1Text returns the rendered width and cap-height of val at sizeMM
// using the exact same Helvetica metrics as RenderTiledGS1PDF/drawGS1Text and
// InjectGS1ObjectsIntoSVG. The position editor calls this (via the
// text-metrics endpoint) to compute its own 180-degree rotation pivot from
// the same numbers the PDF/SVG export use, instead of the browser's own
// substituted font metrics — otherwise a rotated object's on-screen pivot
// silently drifts from where export actually rotates it.
func MeasureGS1Text(val string, sizeMM float64, weight string) (widthMM, capHeightMM float64) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.AddPage()
	fontStyle := ""
	if weight == WeightBold || weight == WeightExtraBold {
		fontStyle = "B"
	}
	pdf.SetFont("Helvetica", fontStyle, sizeMM*mmToPt)
	textTr := pdf.UnicodeTranslatorFromDescriptor("")
	return pdf.GetStringWidth(gs1SanitizeText(textTr, val)), sizeMM * gs1TextCapHeightRatio
}

// drawGS1Text draws val at baseline (tx,ty), optionally rotated 180 degrees
// around its own visual center. fpdf's Helvetica only ships Regular and
// Bold font programs (no true Extra Bold), so WeightExtraBold is faked by
// asking the PDF viewer to fill AND stroke the Bold glyph outline (PDF text
// rendering mode "Tr 2", set via RawWriteStr since fpdf's Text() has no
// parameter for it) — a uniformly thicker glyph with none of the directional
// artifacts the old multi-copy-offset trick produced.
//
// Every draw is wrapped in TransformBegin/TransformEnd (PDF "q"/"Q") even
// when not rotating, so the stroke width/color/join and text-render-mode
// changes are scoped to this call and never leak into whatever is drawn
// next (barcode lines, other text fields).
func drawGS1Text(pdf *fpdf.Fpdf, val string, tx, ty, sizeMM float64, weight string, rotate180 bool) {
	extraBold := weight == WeightExtraBold

	pdf.TransformBegin()
	if rotate180 {
		cx := tx + pdf.GetStringWidth(val)/2
		cy := ty - sizeMM*gs1TextCapHeightRatio/2
		pdf.TransformRotate(180, cx, cy)
	}
	if extraBold {
		pdf.SetLineWidth(gs1ExtraBoldStrokeWidthMM)
		pdf.SetDrawColor(0, 0, 0)
		pdf.SetLineJoinStyle("round")
		pdf.SetLineCapStyle("round")
		pdf.RawWriteStr("2 Tr\n")
	}
	pdf.Text(tx, ty, val)
	if extraBold {
		pdf.RawWriteStr("0 Tr\n")
	}
	pdf.TransformEnd()
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
// RenderTiledGS1PDF's compositing for GS1-flagged templates. fieldValues
// supplies the resolved value for each TextObjectConfig.Field; objects whose
// field has no value are skipped.
//
// Text position/size do NOT use the same bare percentage convention as the
// image elements. Percentages on width/height/x/y are SVG geometry lengths
// and correctly resolve against the viewport, but font-size is a CSS
// property: per spec a percentage there resolves against the *inherited*
// font-size, not the viewport, so `font-size="5%"` renders at whatever the
// consuming renderer's default text size times 0.05 happens to be — visibly
// wrong and different from the editor/PDF export. `transform="rotate(180)"`
// with `transform-box:fill-box` has the same portability problem: it needs
// the renderer to support CSS transform-box, which many raw-SVG consumers
// (print RIPs, older vector editors) do not, so the rotation pivots around
// the wrong point.
//
// Instead each text object gets its own nested <svg> sub-viewport, placed
// with the same percentage x/y/width/height as the images (safe — those are
// geometry, not font-size), but with a viewBox sized in real millimeters
// (measured via fpdf's Helvetica metrics, the same font/engine
// RenderTiledGS1PDF uses) so that inside it, 1 unitless user unit == 1mm
// uniformly in both axes. Font-size and the rotate() pivot are then given as
// plain mm numbers in that local space — SVG treats an unsuffixed length as
// "current user coordinate system units", so this actually scales, and
// rotate(angle,cx,cy) with numeric cx/cy is universally supported SVG 1.1,
// no CSS feature detection required. The mm math (sizeMM, baseline offset,
// rotation center) mirrors RenderTiledGS1PDF's drawGS1Text exactly, so the
// same label renders the same physical text size/position in both exports.
func InjectGS1ObjectsIntoSVG(svgBytes, qrPNG, barcodePNG []byte, qrXRatio, qrYRatio, qrSizeRatio float64, layout GS1Layout, fieldValues GS1FieldValues, widthMM, heightMM float64) ([]byte, error) {
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

	measurePdf := fpdf.New("P", "mm", "A4", "")
	measurePdf.AddPage()

	for _, obj := range layout.TextObjects {
		val := fieldValues.resolve(obj)
		if val == "" {
			continue
		}
		fontWeight := "normal"
		fontStyle := ""
		var strokeAttrs string
		switch obj.Weight {
		case WeightBold:
			fontWeight = "bold"
			fontStyle = "B"
		case WeightExtraBold:
			// fpdf's core Helvetica has no true Extra Bold, so
			// drawGS1Text fakes it via PDF fill+stroke text rendering
			// (Tr 2). Mirror that here with SVG's native stroke-on-text
			// instead of font-weight:900 — a numeric CSS weight has no
			// guaranteed Arial/Helvetica instance, so SVG consumers
			// (Illustrator among them) synthesize it inconsistently. A
			// real stroke traces the glyph outline uniformly (round
			// joins/caps avoid jagged corners), rendering equivalently
			// to the PDF export without any weight synthesis.
			fontWeight = "bold"
			fontStyle = "B"
			strokeAttrs = fmt.Sprintf(` stroke="#000000" stroke-width="%.4f" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`, gs1ExtraBoldStrokeWidthMM)
		}

		sizeMM := obj.SizeRatio * widthMM
		measurePdf.SetFont("Helvetica", fontStyle, sizeMM*mmToPt)
		textWidthMM := measurePdf.GetStringWidth(val)
		if textWidthMM < 0.01 {
			textWidthMM = 0.01
		}
		boxHeightMM := sizeMM
		baselineLocal := boxHeightMM * gs1TextCapHeightRatio

		widthPct := textWidthMM / widthMM * 100
		heightPct := boxHeightMM / heightMM * 100

		var textTransform string
		if obj.Rotate180 {
			textTransform = fmt.Sprintf(` transform="rotate(180, %.4f, %.4f)"`, textWidthMM/2, baselineLocal/2)
		}

		var textEls bytes.Buffer
		fmt.Fprintf(&textEls, `<text x="0" y="%.4f" font-size="%.4f" font-family="Arial, Helvetica, sans-serif" font-weight="%s"%s>%s</text>`,
			baselineLocal, boxHeightMM, fontWeight, strokeAttrs, escapeXMLText(val))

		fmt.Fprintf(&els, `<svg x="%.4f%%" y="%.4f%%" width="%.4f%%" height="%.4f%%" viewBox="0 0 %.4f %.4f" preserveAspectRatio="none" overflow="visible"><g%s>%s</g></svg>`,
			obj.XRatio*100, obj.YRatio*100, widthPct, heightPct, textWidthMM, boxHeightMM,
			textTransform, textEls.String())
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
