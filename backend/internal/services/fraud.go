package services

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// FraudDetector periodically flags qr_tokens that show suspicious scan patterns.
// Rule: within last 24h, if a token was scanned from >=3 distinct cities OR >=10 distinct IPs, flag it.
type FraudDetector struct {
	DB       *pgxpool.Pool
	Interval time.Duration
	stop     chan struct{}
}

func NewFraudDetector(db *pgxpool.Pool, interval time.Duration) *FraudDetector {
	return &FraudDetector{DB: db, Interval: interval, stop: make(chan struct{})}
}

func (f *FraudDetector) Start() {
	go f.loop()
}

func (f *FraudDetector) Stop() {
	close(f.stop)
}

func (f *FraudDetector) loop() {
	// Run once at startup, then on interval
	f.RunOnce()
	ticker := time.NewTicker(f.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-f.stop:
			return
		case <-ticker.C:
			f.RunOnce()
		}
	}
}

func (f *FraudDetector) RunOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tag, err := f.DB.Exec(ctx, `
		UPDATE qr_tokens SET status='flagged'
		WHERE id IN (
			SELECT s.token_id FROM scan_logs s
			WHERE s.scanned_at > NOW() - INTERVAL '24 hours'
			GROUP BY s.token_id
			HAVING COUNT(DISTINCT s.city) >= 3 OR COUNT(DISTINCT s.ip_address) >= 10
		) AND status IN ('activated','pending')
	`)
	if err != nil {
		log.Printf("[fraud] scan failed: %v", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		log.Printf("[fraud] flagged %d tokens as suspicious", n)
	}
}
