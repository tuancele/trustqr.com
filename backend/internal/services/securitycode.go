package services

import (
	"crypto/rand"
	"fmt"
)

// Excludes 0/1/i/l/o to avoid transcription errors when a user types the code by hand.
const securityCodeAlphabet = "23456789abcdefghjkmnpqrstuvwxyz"

// GenerateSecurityCode produces a human-friendly code grouped as 4x4 characters
// (e.g. "a3b7-k9mn-4pqr-8stv"), separate from the QR's secret_code/URL.
func GenerateSecurityCode() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, 16)
	for i, v := range b {
		out[i] = securityCodeAlphabet[int(v)%len(securityCodeAlphabet)]
	}
	return fmt.Sprintf("%s-%s-%s-%s", out[0:4], out[4:8], out[8:12], out[12:16]), nil
}
