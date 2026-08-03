package main

import (
	"context"
	"flag"
	"fmt"
	"log"

	"trustqr/backend/internal/config"
	"trustqr/backend/internal/database"
	"trustqr/backend/internal/services"
)

func main() {
	email := flag.String("email", "", "admin email")
	password := flag.String("password", "", "admin password (min 12 chars)")
	flag.Parse()

	if *email == "" || len(*password) < 12 {
		log.Fatalf("usage: create-admin -email you@trustqr.com -password 'MinTwelveChars!'")
	}

	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgres(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	auth := services.NewAuthService(cfg.JWTSecret)

	hash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("hash: %v", err)
	}
	key, err := auth.GenerateTOTPSecret(*email)
	if err != nil {
		log.Fatalf("totp: %v", err)
	}

	var id int64
	err = pool.QueryRow(ctx, `
		INSERT INTO admin_users (email, password_hash, totp_secret, totp_enabled, is_active)
		VALUES ($1, $2, $3, TRUE, TRUE)
		ON CONFLICT (email) DO UPDATE
		SET password_hash = EXCLUDED.password_hash,
		    totp_secret   = EXCLUDED.totp_secret,
		    totp_enabled  = TRUE,
		    is_active     = TRUE,
		    failed_attempts = 0,
		    locked_until  = NULL
		RETURNING id
	`, *email, hash, key.Secret()).Scan(&id)
	if err != nil {
		log.Fatalf("insert: %v", err)
	}

	fmt.Println("=== Admin account ready ===")
	fmt.Printf("ID:            %d\n", id)
	fmt.Printf("Email:         %s\n", *email)
	fmt.Printf("TOTP Secret:   %s\n", key.Secret())
	fmt.Printf("TOTP URL:      %s\n", key.URL())
	fmt.Println()
	fmt.Println("👉 Add the TOTP Secret above to Google Authenticator / Authy.")
	fmt.Println("   Or scan the URL as a QR code:")
	fmt.Println("   https://api.qrserver.com/v1/create-qr-code/?data=" + key.URL())
}
