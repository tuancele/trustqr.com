package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	jwtSecret []byte
	issuer    string
}

func NewAuthService(jwtSecret string) *AuthService {
	return &AuthService{jwtSecret: []byte(jwtSecret), issuer: "trustqr"}
}

// -------- Password --------

func (a *AuthService) HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), 12)
	return string(b), err
}

func (a *AuthService) VerifyPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// -------- TOTP --------

func (a *AuthService) GenerateTOTPSecret(email string) (*otp.Key, error) {
	return totp.Generate(totp.GenerateOpts{
		Issuer:      "TrustQR",
		AccountName: email,
	})
}

func (a *AuthService) VerifyTOTP(secret, code string) bool {
	return totp.Validate(code, secret)
}

// -------- JWT --------

type Claims struct {
	AdminID int64  `json:"aid"`
	Email   string `json:"email"`
	Kind    string `json:"kind"` // "temp" (post-password, pre-2fa) | "access" | "refresh"
	jwt.RegisteredClaims
}

func (a *AuthService) IssueTempToken(adminID int64, email string) (string, error) {
	return a.sign(adminID, email, "temp", 5*time.Minute)
}

func (a *AuthService) IssueAccessToken(adminID int64, email string) (string, error) {
	return a.sign(adminID, email, "access", 15*time.Minute)
}

func (a *AuthService) IssueRefreshToken(adminID int64, email string) (string, error) {
	return a.sign(adminID, email, "refresh", 7*24*time.Hour)
}

func (a *AuthService) sign(id int64, email, kind string, ttl time.Duration) (string, error) {
	claims := Claims{
		AdminID: id,
		Email:   email,
		Kind:    kind,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    a.issuer,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(a.jwtSecret)
}

func (a *AuthService) Parse(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("bad signing method")
		}
		return a.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}
