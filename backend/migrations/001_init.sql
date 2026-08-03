-- Initial schema for TrustQR anti-counterfeit system

CREATE TABLE IF NOT EXISTS admin_users (
  id              BIGSERIAL PRIMARY KEY,
  email           VARCHAR(200) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  totp_secret     VARCHAR(64) NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
  id            BIGSERIAL PRIMARY KEY,
  batch_code    VARCHAR(50) UNIQUE NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  total_qty     INT NOT NULL,
  created_by    BIGINT REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS distributor_boxes (
  id                BIGSERIAL PRIMARY KEY,
  box_code          VARCHAR(50) UNIQUE NOT NULL,
  batch_id          BIGINT NOT NULL REFERENCES batches(id),
  distributor_name  VARCHAR(200) NOT NULL,
  distributor_phone VARCHAR(20),
  distributor_addr  TEXT,
  total_tokens      INT NOT NULL DEFAULT 0,
  assigned_at       TIMESTAMPTZ DEFAULT NOW(),
  assigned_by       BIGINT REFERENCES admin_users(id),
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS qr_tokens (
  id                 BIGSERIAL PRIMARY KEY,
  batch_id           BIGINT NOT NULL REFERENCES batches(id),
  distributor_box_id BIGINT REFERENCES distributor_boxes(id),
  secret_code        VARCHAR(16) UNIQUE NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',
  scan_count         INT NOT NULL DEFAULT 0,
  first_scanned_at   TIMESTAMPTZ,
  first_scan_city    VARCHAR(100),
  first_scan_ip      INET,
  is_activated       BOOLEAN NOT NULL DEFAULT FALSE,
  activated_phone    VARCHAR(20),
  activated_voucher  VARCHAR(20),
  activated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_secret ON qr_tokens (secret_code);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_phone  ON qr_tokens (activated_phone);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_box    ON qr_tokens (distributor_box_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_status ON qr_tokens (status) WHERE status <> 'activated';

-- scan_logs: partitioned by month
CREATE TABLE IF NOT EXISTS scan_logs (
  id         BIGSERIAL,
  token_id   BIGINT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  city       VARCHAR(100),
  region     VARCHAR(100),
  country    VARCHAR(2),
  is_repeat  BOOLEAN NOT NULL DEFAULT FALSE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, scanned_at)
) PARTITION BY RANGE (scanned_at);

-- Create partitions for current and next few months
DO $$
DECLARE
  m DATE := date_trunc('month', NOW())::DATE;
  i INT;
  pname TEXT;
  ps DATE;
  pe DATE;
BEGIN
  FOR i IN 0..5 LOOP
    ps := m + (i || ' month')::INTERVAL;
    pe := m + ((i+1) || ' month')::INTERVAL;
    pname := 'scan_logs_' || to_char(ps, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF scan_logs FOR VALUES FROM (%L) TO (%L)',
      pname, ps, pe
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_scan_logs_token ON scan_logs (token_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ip    ON scan_logs (ip_address, scanned_at);

CREATE TABLE IF NOT EXISTS customer_leads (
  id                       BIGSERIAL PRIMARY KEY,
  phone                    VARCHAR(20) UNIQUE NOT NULL,
  marketing_consent        BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at     TIMESTAMPTZ,
  total_activated_products INT NOT NULL DEFAULT 1,
  first_activated_at       TIMESTAMPTZ DEFAULT NOW(),
  last_activated_at        TIMESTAMPTZ DEFAULT NOW(),
  privacy_policy_version   VARCHAR(20),
  deletion_requested_at    TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT REFERENCES admin_users(id),
  action      VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id   VARCHAR(100),
  payload     JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id           BIGSERIAL PRIMARY KEY,
  phone        VARCHAR(20) NOT NULL,
  verify_code  VARCHAR(6),
  status       VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
