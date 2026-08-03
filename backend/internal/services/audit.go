package services

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditLogger struct {
	DB *pgxpool.Pool
}

func NewAuditLogger(db *pgxpool.Pool) *AuditLogger {
	return &AuditLogger{DB: db}
}

func (a *AuditLogger) Log(adminID int64, action, targetType, targetID string, payload any, ip, ua string) {
	go func() {
		ctx := context.Background()
		var payloadJSON []byte
		if payload != nil {
			payloadJSON, _ = json.Marshal(payload)
		}
		_, err := a.DB.Exec(ctx, `
			INSERT INTO audit_logs (admin_id, action, target_type, target_id, payload, ip_address, user_agent)
			VALUES ($1, $2, $3, $4, $5, NULLIF($6,'')::inet, NULLIF($7,''))
		`, nullIfZero(adminID), action, targetType, targetID, payloadJSON, ip, ua)
		if err != nil {
			log.Printf("audit log: %v", err)
		}
	}()
}

func nullIfZero(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}
