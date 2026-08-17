-- Adds a consumer-facing verification QR (separate from the GS1 DataMatrix,
-- which encodes AI element strings for supply-chain scanners, not URLs).
-- verify_code is an HMAC-signed token (same scheme as qr_tokens.secret_code)
-- resolved by GET /auth/:code on the frontend.
ALTER TABLE gs1_labels
  ADD COLUMN IF NOT EXISTS verify_code      VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS scan_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_scanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_scan_city  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS first_scan_ip    INET,
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20) NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_gs1_labels_verify_code ON gs1_labels (verify_code);

-- Scan log kept separate from the main scan_logs table (partitioned, high
-- volume) since this module is independent and expected volume is far lower —
-- a plain table avoids the monthly-partition-maintenance burden.
CREATE TABLE IF NOT EXISTS gs1_scan_logs (
  id              BIGSERIAL PRIMARY KEY,
  label_id        BIGINT NOT NULL REFERENCES gs1_labels(id) ON DELETE CASCADE,
  ip_address      INET,
  user_agent      TEXT,
  city            VARCHAR(100),
  region          VARCHAR(100),
  country         VARCHAR(2),
  is_repeat       BOOLEAN NOT NULL DEFAULT FALSE,
  device_type     VARCHAR(20),
  os_name         VARCHAR(50),
  os_version      VARCHAR(30),
  browser_name    VARCHAR(50),
  browser_version VARCHAR(30),
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gs1_scan_logs_label ON gs1_scan_logs (label_id, scanned_at DESC);
