package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

// base62 alphabet (lowercase o/O and 0 removed for readability... but we keep all since it's a QR)
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

const (
	RandomPartLen = 6
	HMACPartLen   = 6
	TokenLen      = RandomPartLen + HMACPartLen
)

type TokenService struct {
	secret []byte
}

func NewTokenService(secret string) *TokenService {
	return &TokenService{secret: []byte(secret)}
}

// Generate produces a full token: random_part + hmac_part (12 chars total).
func (s *TokenService) Generate() (string, error) {
	rp, err := randomString(RandomPartLen)
	if err != nil {
		return "", err
	}
	return rp + s.sign(rp), nil
}

// Verify checks length and HMAC. Returns false without touching DB.
func (s *TokenService) Verify(token string) bool {
	if len(token) != TokenLen {
		return false
	}
	rp := token[:RandomPartLen]
	sig := token[RandomPartLen:]
	expected := s.sign(rp)
	return hmac.Equal([]byte(sig), []byte(expected))
}

func (s *TokenService) sign(random string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(random))
	sum := mac.Sum(nil)
	// Encode to hex then map to alphabet-like string, truncate to HMACPartLen
	hexed := hex.EncodeToString(sum)
	// Convert hex string to alphabet-encoded output for consistent visual style
	out := make([]byte, HMACPartLen)
	for i := 0; i < HMACPartLen; i++ {
		// take 2 hex chars per output char to reduce bias, mod alphabet len
		idx := int(hexed[i*2])<<4 | int(hexed[i*2+1])
		out[i] = alphabet[idx%len(alphabet)]
	}
	return string(out)
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return string(out), nil
}
