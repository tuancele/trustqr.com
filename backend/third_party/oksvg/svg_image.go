// Local addition: oksvg upstream has no support at all for the SVG <image>
// element (embedded raster logos/photos) — drawFuncs simply has no case for
// it, so any <image> is silently ignored. Real-world label templates
// exported from Illustrator/CorelDraw commonly embed a brand logo as a
// base64 PNG/JPEG <image>, which then vanished entirely from rasterized
// output. This file adds minimal support: decode the embedded raster data
// and composite it onto the raster canvas using the same transform stack
// (ancestor <g transform> plus the element's own transform/x/y/width/height)
// that paths already use, preserving the element's position in document
// order relative to vector paths.
package oksvg

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"strings"

	"github.com/srwiley/rasterx"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/math/f64"
)

// decodeDataURIImage decodes an <image href="data:...;base64,..."> value.
// Only inline base64 data URIs are supported; external file/URL references
// are intentionally not fetched.
func decodeDataURIImage(href string) (image.Image, error) {
	if !strings.HasPrefix(href, "data:") {
		return nil, fmt.Errorf("unsupported image href (not a data URI)")
	}
	comma := strings.IndexByte(href, ',')
	if comma < 0 {
		return nil, fmt.Errorf("malformed data URI")
	}
	meta, payload := href[5:comma], href[comma+1:]
	if !strings.Contains(meta, "base64") {
		return nil, fmt.Errorf("unsupported data URI encoding")
	}
	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, err
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	return img, err
}

// SvgImage binds a decoded raster image to its untransformed placement
// rect (in local SVG user-space units) and the cumulative transform that
// was active where the <image> element appeared in the source document.
type SvgImage struct {
	Image      image.Image
	X, Y, W, H float64
	M          rasterx.Matrix2D
	Order      int
}

// DrawTransformed composites the image onto target, combining the icon-level
// transform t (viewBox -> target pixel scale) with the image's own cumulative
// document transform M, matching how SvgPath.DrawTransformed combines t and
// the path's mAdder.M.
func (si *SvgImage) DrawTransformed(target draw.Image, t rasterx.Matrix2D) {
	if si.Image == nil || si.W <= 0 || si.H <= 0 {
		return
	}
	b := si.Image.Bounds()
	if b.Dx() <= 0 || b.Dy() <= 0 {
		return
	}
	sx := si.W / float64(b.Dx())
	sy := si.H / float64(b.Dy())
	local := rasterx.Identity.Translate(si.X, si.Y).Scale(sx, sy)
	full := t.Mult(si.M).Mult(local)
	aff := f64.Aff3{full.A, full.C, full.E, full.B, full.D, full.F}
	xdraw.CatmullRom.Transform(target, aff, si.Image, b, xdraw.Over, nil)
}
