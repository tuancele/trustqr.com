// Copyright 2017 The oksvg Authors. All rights reserved.
// created: 2/12/2017 by S.R.Wiley
//
// utils.go implements translation of an SVG2.0 path into a rasterx Path.

package oksvg

import (
	"image/color"

	"github.com/srwiley/rasterx"
	"golang.org/x/image/math/fixed"
)

// SvgPath binds a style to a path.
type SvgPath struct {
	PathStyle
	Path  rasterx.Path
	Order int
}

// Draw the compiled SvgPath into the Dasher.
func (svgp *SvgPath) Draw(r *rasterx.Dasher, opacity float64) {
	svgp.DrawTransformed(r, opacity, rasterx.Identity)
}

// DrawTransformed draws the compiled SvgPath into the Dasher while applying transform t.
func (svgp *SvgPath) DrawTransformed(r *rasterx.Dasher, opacity float64, t rasterx.Matrix2D) {
	m := svgp.mAdder.M
	svgp.mAdder.M = t.Mult(m)
	defer func() { svgp.mAdder.M = m }() // Restore untransformed matrix
	if svgp.fillerColor != nil {
		r.Clear()
		rf := &r.Filler
		rf.SetWinding(svgp.UseNonZeroWinding)
		svgp.mAdder.Adder = rf // This allows transformations to be applied
		svgp.Path.AddTo(&svgp.mAdder)

		switch fillerColor := svgp.fillerColor.(type) {
		case color.Color:
			rf.SetColor(rasterx.ApplyOpacity(fillerColor, svgp.FillOpacity*opacity))
		case rasterx.Gradient:
			if fillerColor.Units == rasterx.ObjectBoundingBox {
				fRect := rf.Scanner.GetPathExtent()
				mnx, mny := float64(fRect.Min.X)/64, float64(fRect.Min.Y)/64
				mxx, mxy := float64(fRect.Max.X)/64, float64(fRect.Max.Y)/64
				fillerColor.Bounds.X, fillerColor.Bounds.Y = mnx, mny
				fillerColor.Bounds.W, fillerColor.Bounds.H = mxx-mnx, mxy-mny
			}
			rf.SetColor(fillerColor.GetColorFunction(svgp.FillOpacity * opacity))
		}
		rf.Draw()
		// default is true
		rf.SetWinding(true)
	}
	if svgp.linerColor != nil {
		r.Clear()
		svgp.mAdder.Adder = r
		lineGap := svgp.LineGap
		if lineGap == nil {
			lineGap = DefaultStyle.LineGap
		}
		lineCap := svgp.LineCap
		if lineCap == nil {
			lineCap = DefaultStyle.LineCap
		}
		leadLineCap := lineCap
		if svgp.LeadLineCap != nil {
			leadLineCap = svgp.LeadLineCap
		}
		r.SetStroke(fixed.Int26_6(svgp.LineWidth*64),
			fixed.Int26_6(svgp.MiterLimit*64), leadLineCap, lineCap,
			lineGap, svgp.LineJoin, svgp.Dash, svgp.DashOffset)
		svgp.Path.AddTo(&svgp.mAdder)
		switch linerColor := svgp.linerColor.(type) {
		case color.Color:
			r.SetColor(rasterx.ApplyOpacity(linerColor, svgp.LineOpacity*opacity))
		case rasterx.Gradient:
			if linerColor.Units == rasterx.ObjectBoundingBox {
				fRect := r.Scanner.GetPathExtent()
				mnx, mny := float64(fRect.Min.X)/64, float64(fRect.Min.Y)/64
				mxx, mxy := float64(fRect.Max.X)/64, float64(fRect.Max.Y)/64
				linerColor.Bounds.X, linerColor.Bounds.Y = mnx, mny
				linerColor.Bounds.W, linerColor.Bounds.H = mxx-mnx, mxy-mny
			}
			r.SetColor(linerColor.GetColorFunction(svgp.LineOpacity * opacity))
		}
		r.Draw()
	}
}

// AddTransformedTo feeds this path's own segments into q, transformed by t
// composed with this path's own nested-group transform (e.g. a parent <g
// transform="...">) — the exact composition DrawTransformed uses when
// rasterizing, so a caller that wants the same coordinates without going
// through a raster Dasher (e.g. a vector PDF exporter) gets an identical
// result to what actually renders.
func (svgp *SvgPath) AddTransformedTo(q rasterx.Adder, t rasterx.Matrix2D) {
	svgp.Path.AddTo(&rasterx.MatrixAdder{Adder: q, M: t.Mult(svgp.mAdder.M)})
}

// HasStroke reports whether this path has a stroke paint defined (as opposed
// to GetLineColor, which always returns a color — defaulting to black — even
// for a path with no stroke at all).
func (svgp *SvgPath) HasStroke() bool {
	return svgp.linerColor != nil
}

// ComposedTransform returns t composed with this path's own nested-group
// transform — the exact matrix AddTransformedTo applies to every point.
// Callers use this to convert path-local lengths (stroke width, dash
// pattern) into whatever units t's points end up in, via TransformVector.
func (svgp *SvgPath) ComposedTransform(t rasterx.Matrix2D) rasterx.Matrix2D {
	return t.Mult(svgp.mAdder.M)
}

// GetFillColor returns the fill color of the SvgPath if one is defined and otherwise returns colornames.Black
func (svgp *SvgPath) GetFillColor() color.Color {
	return getColor(svgp.fillerColor)
}

// GetLineColor returns the stroke color of the SvgPath if one is defined and otherwise returns colornames.Black
func (svgp *SvgPath) GetLineColor() color.Color {
	return getColor(svgp.linerColor)
}

// SetFillColor sets the fill color of the SvgPath
func (svgp *SvgPath) SetFillColor(clr color.Color) {
	svgp.fillerColor = clr
}

// SetLineColor sets the line color of the SvgPath
func (svgp *SvgPath) SetLineColor(clr color.Color) {
	svgp.linerColor = clr
}
