package services

import (
	"fmt"
	"regexp"
	"time"
)

var gtinDigitsRe = regexp.MustCompile(`^\d{8,14}$`)

// GS1Fields holds the values needed to build the AI element string for the
// GS1 DataMatrix module (AI 01/11/17/10/21), mirroring the structure printed
// on Dentium's UDI label.
type GS1Fields struct {
	GTIN            string // 8-14 digit string, product-level, NOT reused across products
	ManufactureDate time.Time
	ExpiryDate      time.Time // zero value if the product has no expiry
	Lot             string    // batch_code
	Serial          string    // gs1_serial, unique per unit
}

// BuildGS1ElementString returns the human-readable AI-bracketed form
// "(01)...(11)...(17)...(10)...(21)..." that bwip-js's gs1datamatrix
// symbology expects as input; it inserts FNC1/GS separators itself.
func BuildGS1ElementString(f GS1Fields) (string, error) {
	if !gtinDigitsRe.MatchString(f.GTIN) {
		return "", fmt.Errorf("gtin_must_be_8_to_14_digits")
	}
	gtin14 := fmt.Sprintf("%014s", f.GTIN)
	if f.ManufactureDate.IsZero() {
		return "", fmt.Errorf("manufacture_date_required")
	}
	if f.Lot == "" {
		return "", fmt.Errorf("lot_required")
	}
	if f.Serial == "" {
		return "", fmt.Errorf("serial_required")
	}

	s := fmt.Sprintf("(01)%s(11)%s", gtin14, f.ManufactureDate.Format("060102"))
	if !f.ExpiryDate.IsZero() {
		s += fmt.Sprintf("(17)%s", f.ExpiryDate.Format("060102"))
	}
	s += fmt.Sprintf("(10)%s(21)%s", f.Lot, f.Serial)
	return s, nil
}
