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
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
	"golang.org/x/image/math/fixed"
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
	// OffsetY is the vertical distance from the sheet's top edge to the first
	// row of cells. The requested margin only sets the *minimum* usable area
	// used to compute Rows; whatever margin is left over after fitting a
	// whole number of rows is unused space that GridLayout splits evenly
	// above and below the grid, so the printed sheet has equal top/bottom
	// margins instead of all the leftover space landing at the bottom.
	OffsetY float64
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
	contentH := float64(rows)*labelH + float64(rows-1)*gutter
	offsetY := (sheetH - contentH) / 2
	return GridSpec{Cols: cols, Rows: rows, OffsetY: offsetY}, nil
}

// DefaultBackgroundColor is used for RasterizeSVG's canvas and the PDF page
// background whenever the admin does not pick a color for a given export.
// Kept white so an SVG template's own shapes (which usually assume a white
// substrate) look correct by default; admins printing on non-white stock, or
// wanting to make dead space/die-cut notches visible against the label, can
// override it per export via ParseHexColor.
var DefaultBackgroundColor = color.RGBA{R: 255, G: 255, B: 255, A: 255}

// ParseHexColor parses a "#RRGGBB" or "RRGGBB" string into an opaque
// color.RGBA. Returns an error for anything else, including 3-digit shorthand
// or alpha channels, which this pipeline has no use for.
func ParseHexColor(hex string) (color.RGBA, error) {
	h := strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(h) != 6 {
		return color.RGBA{}, fmt.Errorf("invalid_hex_color: %q", hex)
	}
	var r, g, b uint8
	if _, err := fmt.Sscanf(h, "%02x%02x%02x", &r, &g, &b); err != nil {
		return color.RGBA{}, fmt.Errorf("invalid_hex_color: %q", hex)
	}
	return color.RGBA{R: r, G: g, B: b, A: 255}, nil
}

// addBackgroundPage adds a new sheetW x sheetH page and fills it with bg
// before any label images are placed, so the sheet's own margin/gutter area
// (outside every placed label image) matches the color RasterizeSVG paints
// behind each label's own template — otherwise the page background would
// stay a different color than the dead space inside each label image.
func addBackgroundPage(pdf *fpdf.Fpdf, orientation string, sheetW, sheetH float64, bg color.RGBA) {
	pdf.AddPageFormat(orientation, fpdf.SizeType{Wd: sheetW, Ht: sheetH})
	pdf.SetFillColor(int(bg.R), int(bg.G), int(bg.B))
	pdf.Rect(0, 0, sheetW, sheetH, "F")
}

// RasterizeSVG rasterizes svgBytes onto an opaque bg-filled widthPx x
// heightPx canvas (stretching non-uniformly to fill the target exactly,
// matching how the rest of the label pipeline treats an admin-set
// width_mm/height_mm as authoritative over whatever aspect ratio the source
// file happens to have) and returns the result PNG-encoded. Used to turn an
// SVG label template into a template image RenderTiledPDF/RenderTiledGS1PDF
// can tile, since Go has no in-process SVG->PDF vector converter — rendering
// at a high enough pixel density keeps the tiled PDF sharp at normal print
// sizes.
func RasterizeSVG(svgBytes []byte, widthPx, heightPx int, bg color.RGBA) ([]byte, error) {
	icon, err := oksvg.ReadIconStream(bytes.NewReader(svgBytes))
	if err != nil {
		return nil, fmt.Errorf("parse svg: %w", err)
	}
	if icon.ViewBox.W <= 0 || icon.ViewBox.H <= 0 {
		return nil, fmt.Errorf("svg has no usable viewBox/width-height")
	}
	icon.SetTarget(0, 0, float64(widthPx), float64(heightPx))

	img := image.NewRGBA(image.Rect(0, 0, widthPx, heightPx))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: bg}, image.Point{}, draw.Src)

	scanner := rasterx.NewScannerGV(widthPx, heightPx, img, img.Bounds())
	dasher := rasterx.NewDasher(widthPx, heightPx, scanner)
	icon.DrawToTarget(dasher, img, 1.0)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
}

// EkeConfig sizes and positions the black L-shaped corner registration marks
// ("eke") a print vendor's laser cutter uses to align sheets. ThicknessMM is
// the bar's width, ArmMM is each arm's length measured from the corner, and
// TopOffsetMM/SideOffsetMM place the bar's OUTER edge relative to the sheet's
// top and side edges respectively (not its centerline).
type EkeConfig struct {
	ThicknessMM   float64
	ArmMM         float64
	TopOffsetMM   float64
	SideOffsetMM  float64
}

// DefaultEkeConfig is the print vendor's originally requested spec, used
// whenever an export request leaves any eke field unset/zero.
func DefaultEkeConfig() EkeConfig {
	return EkeConfig{ThicknessMM: 3, ArmMM: 40, TopOffsetMM: 3.8, SideOffsetMM: 5}
}

// PDFExtras bundles the print-production additions layered on top of every
// tiled PDF page: a background fill color, optional corner registration
// marks, and an optional trailing cutline page. CutlineSVG == nil means no
// cutline page is generated (the admin left "Tạo trang cutline" off).
type PDFExtras struct {
	BackgroundColor color.RGBA
	Eke             EkeConfig
	CutlineSVG      []byte
}

// drawEkeMarks draws EkeConfig's black L-shaped registration mark at all 4
// corners of the current page. Each L is built from 2 filled bars (one
// horizontal, one vertical) meeting at the corner; TopOffsetMM/SideOffsetMM
// position the bar's outer edge, mirrored per corner so every mark points
// inward toward the sheet's center.
func drawEkeMarks(pdf *fpdf.Fpdf, sheetW, sheetH float64, cfg EkeConfig) {
	pdf.SetFillColor(0, 0, 0)
	type corner struct{ top, left bool }
	for _, c := range []corner{{true, true}, {true, false}, {false, true}, {false, false}} {
		var barX, barY float64
		if c.left {
			barX = cfg.SideOffsetMM
		} else {
			barX = sheetW - cfg.SideOffsetMM - cfg.ArmMM
		}
		if c.top {
			barY = cfg.TopOffsetMM
		} else {
			barY = sheetH - cfg.TopOffsetMM - cfg.ArmMM
		}
		// Horizontal arm: full ArmMM length, ThicknessMM tall, flush with the
		// top/bottom offset line.
		hY := cfg.TopOffsetMM
		if !c.top {
			hY = sheetH - cfg.TopOffsetMM - cfg.ThicknessMM
		}
		pdf.Rect(barX, hY, cfg.ArmMM, cfg.ThicknessMM, "F")
		// Vertical arm: full ArmMM length, ThicknessMM wide, flush with the
		// left/right offset line.
		vX := cfg.SideOffsetMM
		if !c.left {
			vX = sheetW - cfg.SideOffsetMM - cfg.ThicknessMM
		}
		pdf.Rect(vX, barY, cfg.ThicknessMM, cfg.ArmMM, "F")
	}
}

// ValidateCutlineSVG rejects an uploaded cutline file that oksvg can't parse
// or that has no usable viewBox/width-height — the same check RasterizeSVG
// itself would fail on at export time, run eagerly at upload time so a bad
// file is caught immediately instead of at the next print export.
func ValidateCutlineSVG(svgBytes []byte) error {
	icon, err := oksvg.ReadIconStream(bytes.NewReader(svgBytes))
	if err != nil {
		return fmt.Errorf("parse cutline svg: %w", err)
	}
	if icon.ViewBox.W <= 0 || icon.ViewBox.H <= 0 {
		return fmt.Errorf("cutline svg has no usable viewBox/width-height")
	}
	return nil
}

// cutlinePathAdder implements rasterx.Adder. SvgPath.AddTransformedTo feeds
// it path segments already transformed into millimeter space (see
// addCutlinePage), so it only has to forward them to fpdf's vector
// path-construction calls — the cutline is drawn as genuine PDF vector
// paths, never rasterized to an image.
type cutlinePathAdder struct {
	pdf        *fpdf.Fpdf
	curX, curY float64
}

func fixedToMM(p fixed.Point26_6) (float64, float64) {
	return float64(p.X) / 64, float64(p.Y) / 64
}

func (a *cutlinePathAdder) Start(p fixed.Point26_6) {
	a.curX, a.curY = fixedToMM(p)
	a.pdf.MoveTo(a.curX, a.curY)
}

func (a *cutlinePathAdder) Line(p fixed.Point26_6) {
	a.curX, a.curY = fixedToMM(p)
	a.pdf.LineTo(a.curX, a.curY)
}

// QuadBezier elevates the SVG quadratic curve to an equivalent cubic, since
// PDF path operators have no native quadratic form. fpdf's own CurveTo
// helper emits the PDF "v" operator, which is a different (non-equivalent)
// cubic shape rather than a true quadratic, so it can't be reused here.
func (a *cutlinePathAdder) QuadBezier(b, c fixed.Point26_6) {
	bx, by := fixedToMM(b)
	cx, cy := fixedToMM(c)
	c1x := a.curX + 2.0/3.0*(bx-a.curX)
	c1y := a.curY + 2.0/3.0*(by-a.curY)
	c2x := cx + 2.0/3.0*(bx-cx)
	c2y := cy + 2.0/3.0*(by-cy)
	a.pdf.CurveBezierCubicTo(c1x, c1y, c2x, c2y, cx, cy)
	a.curX, a.curY = cx, cy
}

func (a *cutlinePathAdder) CubeBezier(b, c, d fixed.Point26_6) {
	bx, by := fixedToMM(b)
	cx, cy := fixedToMM(c)
	dx, dy := fixedToMM(d)
	a.pdf.CurveBezierCubicTo(bx, by, cx, cy, dx, dy)
	a.curX, a.curY = dx, dy
}

func (a *cutlinePathAdder) Stop(closeLoop bool) {
	if closeLoop {
		a.pdf.ClosePath()
	}
}

// cutlineBoundsAdder implements rasterx.Adder and tracks the bounding box of
// every point it receives. Used to measure the actual drawn extent of the
// cutline's stroked paths — which is often smaller than the SVG's own
// viewBox/canvas (design tools commonly leave blank margin around the
// artwork) — so that extent, not the raw viewBox, can be fit to the label's
// real width/height.
type cutlineBoundsAdder struct {
	minX, minY, maxX, maxY float64
	started                bool
}

func (a *cutlineBoundsAdder) include(p fixed.Point26_6) {
	x, y := fixedToMM(p)
	if !a.started {
		a.minX, a.maxX, a.minY, a.maxY, a.started = x, x, y, y, true
		return
	}
	a.minX = math.Min(a.minX, x)
	a.maxX = math.Max(a.maxX, x)
	a.minY = math.Min(a.minY, y)
	a.maxY = math.Max(a.maxY, y)
}

func (a *cutlineBoundsAdder) Start(p fixed.Point26_6) { a.include(p) }
func (a *cutlineBoundsAdder) Line(p fixed.Point26_6)  { a.include(p) }
func (a *cutlineBoundsAdder) QuadBezier(b, c fixed.Point26_6) {
	a.include(b)
	a.include(c)
}
func (a *cutlineBoundsAdder) CubeBezier(b, c, d fixed.Point26_6) {
	a.include(b)
	a.include(c)
	a.include(d)
}
func (a *cutlineBoundsAdder) Stop(closeLoop bool) {}

// addCutlinePage appends the final cutline page: a plain white sheet tiling
// the template's cutline SVG at every grid cell the content pages used, plus
// the same eke corner marks as every other page. The cutline is drawn as
// true PDF vector paths (via oksvg's parsed path data fed straight into
// fpdf's path-construction calls) rather than rasterized, so line quality
// matches the source SVG exactly regardless of print size.
func addCutlinePage(pdf *fpdf.Fpdf, orientation string, sheetW, sheetH, margin, gutter, labelW, labelH float64, grid GridSpec, extras PDFExtras) error {
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}
	addBackgroundPage(pdf, orientation, sheetW, sheetH, white)

	icon, err := oksvg.ReadIconStream(bytes.NewReader(extras.CutlineSVG))
	if err != nil {
		return fmt.Errorf("parse cutline svg: %w", err)
	}
	if icon.ViewBox.W <= 0 || icon.ViewBox.H <= 0 {
		return fmt.Errorf("cutline svg has no usable viewBox/width-height")
	}

	// Fit the cutline's actual drawn extent — not its raw viewBox — to the
	// label's real width/height. Cutline files exported from design tools
	// routinely carry blank canvas margin around the die-line artwork, so
	// scaling the full viewBox into labelW x labelH would undersize the
	// visible cut shape. Measuring the stroked paths' own bounding box and
	// fitting that instead makes the die line span exactly labelW x labelH,
	// matching the label's actual printed size.
	bounds := &cutlineBoundsAdder{}
	for i := range icon.SVGPaths {
		path := &icon.SVGPaths[i]
		if !path.HasStroke() {
			continue
		}
		path.AddTransformedTo(bounds, rasterx.Identity)
	}
	if !bounds.started || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY {
		return fmt.Errorf("cutline svg has no measurable stroked geometry")
	}
	scaleX := labelW / (bounds.maxX - bounds.minX)
	scaleY := labelH / (bounds.maxY - bounds.minY)
	// Target dimensions in millimeters (not pixels): icon.Transform then maps
	// SVG coordinates straight into the PDF's own mm coordinate space, so no
	// separate DPI/pixel conversion is needed anywhere below.
	icon.Transform = rasterx.Identity.Scale(scaleX, scaleY).Translate(-bounds.minX, -bounds.minY)

	for row := 0; row < grid.Rows; row++ {
		for col := 0; col < grid.Cols; col++ {
			cellX := margin + float64(col)*(labelW+gutter)
			cellY := grid.OffsetY + float64(row)*(labelH+gutter)
			cellTransform := rasterx.Identity.Translate(cellX, cellY).Mult(icon.Transform)

			for i := range icon.SVGPaths {
				path := &icon.SVGPaths[i]
				if !path.HasStroke() {
					continue
				}

				// Effective local-units-to-mm scale for this path (its own
				// nested-group transform composed with the cell placement),
				// used to convert stroke width/dash lengths into mm.
				composed := path.ComposedTransform(cellTransform)
				vx, vy := composed.TransformVector(1, 0)
				scaleX := math.Hypot(vx, vy)
				vx2, vy2 := composed.TransformVector(0, 1)
				scaleY := math.Hypot(vx2, vy2)
				scale := (scaleX + scaleY) / 2

				lineWidth := path.LineWidth * scale
				if lineWidth <= 0 {
					lineWidth = 0.1
				}
				r, g, b, _ := path.GetLineColor().RGBA()
				pdf.SetDrawColor(int(r>>8), int(g>>8), int(b>>8))
				pdf.SetLineWidth(lineWidth)
				pdf.SetLineCapStyle("round")
				pdf.SetLineJoinStyle("round")
				if len(path.Dash) > 0 {
					scaledDash := make([]float64, len(path.Dash))
					for di, d := range path.Dash {
						scaledDash[di] = d * scale
					}
					pdf.SetDashPattern(scaledDash, path.DashOffset*scale)
				} else {
					pdf.SetDashPattern(nil, 0)
				}

				path.AddTransformedTo(&cutlinePathAdder{pdf: pdf}, cellTransform)
				pdf.DrawPath("D")
			}
		}
	}
	if pdf.Err() {
		return fmt.Errorf("draw cutline paths: %v", pdf.Error())
	}

	drawEkeMarks(pdf, sheetW, sheetH, extras.Eke)
	return nil
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
//
// extras controls the page background color, the black corner registration
// marks drawn on every page, and an optional trailing cutline page (see
// PDFExtras).
func RenderTiledPDF(templateSrc io.Reader, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error), extras PDFExtras) ([]byte, error) {
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
	addBackgroundPage(pdf, orientation, sheetW, sheetH, extras.BackgroundColor)

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			drawEkeMarks(pdf, sheetW, sheetH, extras.Eke)
			addBackgroundPage(pdf, orientation, sheetW, sheetH, extras.BackgroundColor)
		}
		posInPage := i % perPage
		col := posInPage % grid.Cols
		row := posInPage / grid.Cols
		cellX := margin + float64(col)*(labelW+gutter)
		cellY := grid.OffsetY + float64(row)*(labelH+gutter)

		pdf.ImageOptions("tpl", cellX, cellY, labelW, labelH, false, imgOpts, 0, "")

		qrPNG, err := imageFn(tok)
		if err != nil {
			return nil, fmt.Errorf("generate image for %s: %w", tok.Code, err)
		}
		qrName := "qr_" + tok.Code
		pdf.RegisterImageOptionsReader(qrName, qrOpts, bytes.NewReader(qrPNG))
		pdf.ImageOptions(qrName, cellX+qrOffsetX, cellY+qrOffsetY, qrSide, qrSide, false, qrOpts, 0, "")
	}
	drawEkeMarks(pdf, sheetW, sheetH, extras.Eke)

	if extras.CutlineSVG != nil {
		if err := addCutlinePage(pdf, orientation, sheetW, sheetH, margin, gutter, labelW, labelH, grid, extras); err != nil {
			return nil, err
		}
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

// PrintSettings is a saved snapshot of the "Xuất file in tem hoàn thiện"
// panel's field values for one label template, so an admin who has already
// tuned the sheet size/margin/gutter/etc for a given template doesn't have
// to re-enter them on every export. Mirrors the export-request fields in
// gs1_label_export.go one-for-one; a nil *PrintSettings on a template just
// means "no saved defaults yet."
type PrintSettings struct {
	SheetPreset     string  `json:"sheet_preset"`
	SheetWMM        float64 `json:"sheet_w_mm"`
	SheetHMM        float64 `json:"sheet_h_mm"`
	MarginMM        float64 `json:"margin_mm"`
	GutterMM        float64 `json:"gutter_mm"`
	QRPx            int     `json:"qr_px"`
	BackgroundColor string  `json:"background_color"`
	IncludeCutline  bool    `json:"include_cutline"`
	EkeThicknessMM  float64 `json:"eke_thickness_mm"`
	EkeArmMM        float64 `json:"eke_arm_mm"`
	EkeTopOffsetMM  float64 `json:"eke_top_offset_mm"`
	EkeSideOffsetMM float64 `json:"eke_side_offset_mm"`
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
func RenderTiledGS1PDF(templateSrc io.Reader, templateType string, sheetW, sheetH, labelW, labelH, margin, gutter, qrXRatio, qrYRatio, qrSizeRatio float64, layout GS1Layout, tokens []LabelToken, imageFn func(LabelToken) ([]byte, error), gs1Fn func(LabelToken) (GS1FieldValues, []byte, error), extras PDFExtras) ([]byte, error) {
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
	addBackgroundPage(pdf, orientation, sheetW, sheetH, extras.BackgroundColor)

	for i, tok := range tokens {
		if i > 0 && i%perPage == 0 {
			drawEkeMarks(pdf, sheetW, sheetH, extras.Eke)
			addBackgroundPage(pdf, orientation, sheetW, sheetH, extras.BackgroundColor)
		}
		posInPage := i % perPage
		col := posInPage % grid.Cols
		row := posInPage / grid.Cols
		cellX := margin + float64(col)*(labelW+gutter)
		cellY := grid.OffsetY + float64(row)*(labelH+gutter)

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
	drawEkeMarks(pdf, sheetW, sheetH, extras.Eke)

	if extras.CutlineSVG != nil {
		if err := addCutlinePage(pdf, orientation, sheetW, sheetH, margin, gutter, labelW, labelH, grid, extras); err != nil {
			return nil, err
		}
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
