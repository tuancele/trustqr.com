package services

import (
	"errors"
	"regexp"
	"strings"
)

// Vietnamese mobile prefixes (after country code 84):
// Viettel: 32-39, 86, 96-98
// Vinaphone: 81-85, 88, 91, 94
// Mobifone: 70, 76-79, 89, 90, 93
// Vietnamobile: 52, 56, 58, 92
// Gmobile: 59, 99
// Itel: 87
var vnMobilePrefixes = []string{
	"32", "33", "34", "35", "36", "37", "38", "39",
	"52", "56", "58", "59",
	"70", "76", "77", "78", "79",
	"81", "82", "83", "84", "85", "86", "87", "88", "89",
	"90", "91", "92", "93", "94", "96", "97", "98", "99",
}

var digitsOnly = regexp.MustCompile(`\D`)

// NormalizePhoneVN normalizes any Vietnamese phone format into E.164 (+84xxxxxxxxx).
// Accepts: 0912345678, 84912345678, +84912345678, +84 912 345 678, etc.
func NormalizePhoneVN(input string) (string, error) {
	digits := digitsOnly.ReplaceAllString(input, "")
	if digits == "" {
		return "", errors.New("empty phone")
	}

	// Strip country code variants
	switch {
	case strings.HasPrefix(digits, "84") && len(digits) >= 11:
		digits = digits[2:]
	case strings.HasPrefix(digits, "0") && len(digits) >= 10:
		digits = digits[1:]
	}

	// After stripping, must be 9 digits and start with valid mobile prefix
	if len(digits) != 9 {
		return "", errors.New("invalid length")
	}
	prefix := digits[:2]
	valid := false
	for _, p := range vnMobilePrefixes {
		if p == prefix {
			valid = true
			break
		}
	}
	if !valid {
		return "", errors.New("invalid prefix")
	}
	return "+84" + digits, nil
}
