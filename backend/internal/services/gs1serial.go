package services

import (
	"crypto/rand"
)

// Excludes 0/1/i/l/o to avoid transcription errors, uppercase only to match
// the style of AI(21) serials seen on real UDI labels (e.g. "A25L350981").
const gs1SerialAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

const gs1SerialLen = 10

// GenerateGS1Serial produces a unique-per-call AI(21) serial number. Callers
// must still enforce uniqueness via the qr_tokens.gs1_serial UNIQUE constraint
// and retry on conflict, since this is random rather than sequential.
func GenerateGS1Serial() (string, error) {
	b := make([]byte, gs1SerialLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, gs1SerialLen)
	for i, v := range b {
		out[i] = gs1SerialAlphabet[int(v)%len(gs1SerialAlphabet)]
	}
	return string(out), nil
}
