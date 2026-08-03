package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"trustqr/backend/internal/config"
	"trustqr/backend/internal/database"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgres(ctx, cfg.DatabaseURL())
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	migDir := "migrations"
	if len(os.Args) > 1 {
		migDir = os.Args[1]
	}

	files, err := filepath.Glob(filepath.Join(migDir, "*.sql"))
	if err != nil {
		log.Fatalf("glob: %v", err)
	}
	sort.Strings(files)

	// Ensure migrations table exists (self-bootstrap)
	_, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version VARCHAR(50) PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`)
	if err != nil {
		log.Fatalf("create migrations table: %v", err)
	}

	for _, f := range files {
		version := strings.TrimSuffix(filepath.Base(f), ".sql")
		var exists bool
		err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists)
		if err != nil {
			log.Fatalf("check migration %s: %v", version, err)
		}
		if exists {
			fmt.Printf("[skip] %s already applied\n", version)
			continue
		}

		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			log.Fatalf("read %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			log.Fatalf("apply %s: %v", version, err)
		}
		if _, err := pool.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES($1)", version); err != nil {
			log.Fatalf("record %s: %v", version, err)
		}
		fmt.Printf("[applied] %s\n", version)
	}
	fmt.Println("Migrations complete.")
}
