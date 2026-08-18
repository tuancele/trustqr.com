// Copyright 2017 The oksvg Authors. All rights reserved.
// created: 2/12/2017 by S.R.Wiley
//
// utils.go implements translation of an SVG2.0 path into a rasterx Path.

package oksvg

import (
	"image/draw"

	"github.com/srwiley/rasterx"
)

// SvgIcon holds data from parsed SVGs.
type SvgIcon struct {
	ViewBox      struct{ X, Y, W, H float64 }
	Titles       []string // Title elements collect here
	Descriptions []string // Description elements collect here
	Grads        map[string]*rasterx.Gradient
	Defs         map[string][]definition
	SVGPaths     []SvgPath
	Images       []SvgImage
	Transform    rasterx.Matrix2D
	classes      map[string]styleAttribute
}

// Draw the compiled SVG icon into the GraphicContext.
// All elements should be contained by the Bounds rectangle of the SvgIcon.
func (s *SvgIcon) Draw(r *rasterx.Dasher, opacity float64) {
	s.DrawToTarget(r, nil, opacity)
}

// DrawToTarget draws the compiled SVG icon's vector paths into r, and (if
// target is non-nil) composites any embedded raster <image> elements into
// target, replaying both in original document order so images correctly
// layer above/below whatever vector content surrounds them in the source.
func (s *SvgIcon) DrawToTarget(r *rasterx.Dasher, target draw.Image, opacity float64) {
	pi, ii := 0, 0
	for pi < len(s.SVGPaths) || ii < len(s.Images) {
		if ii >= len(s.Images) || (pi < len(s.SVGPaths) && s.SVGPaths[pi].Order <= s.Images[ii].Order) {
			s.SVGPaths[pi].DrawTransformed(r, opacity, s.Transform)
			pi++
		} else {
			if target != nil {
				s.Images[ii].DrawTransformed(target, s.Transform)
			}
			ii++
		}
	}
}

// SetTarget sets the Transform matrix to draw within the bounds of the rectangle arguments
func (s *SvgIcon) SetTarget(x, y, w, h float64) {
	scaleW := w / s.ViewBox.W
	scaleH := h / s.ViewBox.H
	s.Transform = rasterx.Identity.Translate(x-s.ViewBox.X, y-s.ViewBox.Y).Scale(scaleW, scaleH)
}
