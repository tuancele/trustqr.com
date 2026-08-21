package services

import (
	"fmt"
	"regexp"
	"time"
)

var gtinDigitsRe = regexp.MustCompile(`^\d{8,14}$`)

// gtinAlnumRe accepts a non-GS1 product identifier — most commonly a US FDA
// UDI Primary DI Number (e.g. "D755FXS5007C0") — for USA-imported products
// that were never assigned a real GS1 GTIN. Values matching this are encoded
// into AI(01) as-is (no zero-padding to 14 digits), which is NOT standard
// GS1 (AI 01 is defined as a fixed 14-digit numeric field); a strictly
// GS1-compliant scanner may misread it. This tradeoff was chosen deliberately
// so brands whose only identifier is a Primary DI Number can still be
// verified, at the cost of GS1 spec purity for that field.
var gtinAlnumRe = regexp.MustCompile(`^[A-Za-z0-9]{6,20}$`)

// GS1Fields holds the values needed to build the AI element string for the
// GS1 DataMatrix module (AI 01/11/17/10/21), mirroring the structure printed
// on Dentium's UDI label.
type GS1Fields struct {
	GTIN            string // 8-14 digit GTIN, or a 6-20 char alphanumeric Primary DI Number
	ManufactureDate time.Time
	ExpiryDate      time.Time // zero value if the product has no expiry
	Lot             string    // batch_code
	Serial          string    // gs1_serial, unique per unit
}

// BuildGS1ElementString returns the human-readable AI-bracketed form
// "(01)...(11)...(17)...(10)...(21)..." that bwip-js's gs1datamatrix
// symbology expects as input; it inserts FNC1/GS separators itself.
func BuildGS1ElementString(f GS1Fields) (string, error) {
	var gtinValue string
	switch {
	case gtinDigitsRe.MatchString(f.GTIN):
		gtinValue = fmt.Sprintf("%014s", f.GTIN)
	case gtinAlnumRe.MatchString(f.GTIN):
		gtinValue = f.GTIN
	default:
		return "", fmt.Errorf("gtin_invalid_format")
	}
	if f.ManufactureDate.IsZero() {
		return "", fmt.Errorf("manufacture_date_required")
	}
	if f.Lot == "" {
		return "", fmt.Errorf("lot_required")
	}
	if f.Serial == "" {
		return "", fmt.Errorf("serial_required")
	}

	s := fmt.Sprintf("(01)%s(11)%s", gtinValue, f.ManufactureDate.Format("060102"))
	if !f.ExpiryDate.IsZero() {
		s += fmt.Sprintf("(17)%s", f.ExpiryDate.Format("060102"))
	}
	s += fmt.Sprintf("(10)%s(21)%s", f.Lot, f.Serial)
	return s, nil
}
