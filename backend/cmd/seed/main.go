package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"

	"trustqr/backend/internal/config"
	"trustqr/backend/internal/database"
	"trustqr/backend/internal/services"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgres(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	ts := services.NewTokenService(cfg.QRHMACSecret)

	// Create a demo batch
	var batchID int64
	err = pool.QueryRow(ctx, `
		INSERT INTO batches (batch_code, product_name, total_qty, notes)
		VALUES ('BATCH-DEMO-001', 'Yanhee Pink Gel 10g', 20, 'Demo seed')
		ON CONFLICT (batch_code) DO UPDATE SET product_name = EXCLUDED.product_name
		RETURNING id
	`).Scan(&batchID)
	if err != nil {
		log.Fatalf("seed batch: %v", err)
	}

	// Wipe existing demo tokens
	_, _ = pool.Exec(ctx, `DELETE FROM qr_tokens WHERE batch_id=$1`, batchID)

	rows := make([][]any, 0, 20)
	fmt.Println("Generated demo QR codes:")
	for i := 0; i < 20; i++ {
		code, err := ts.Generate()
		if err != nil {
			log.Fatalf("gen: %v", err)
		}
		rows = append(rows, []any{batchID, code, "pending"})
		fmt.Printf("  %s/v/%s\n", cfg.PublicBaseURL, code)
	}

	_, err = pool.CopyFrom(ctx,
		pgx.Identifier{"qr_tokens"},
		[]string{"batch_id", "secret_code", "status"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		log.Fatalf("copy: %v", err)
	}

	fmt.Printf("\nSeeded 20 tokens under batch id=%d (BATCH-DEMO-001)\n", batchID)
	fmt.Println("Try opening any URL above in your browser (frontend must be running on :3000).")
}
