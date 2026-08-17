-- Corrects the GS1 verify architecture: a gs1_labels row is a product/lot
-- DEFINITION (like a "batch"), not a single physical item — printing a run
-- of 500-1000 stickers for it needs one UNIQUE verify code per physical
-- sticker, mirroring how qr_tokens rows are unique per unit within a batch.
-- Scan tracking moves from gs1_labels (one shared history) to each unit.
CREATE TABLE IF NOT EXISTS gs1_label_units (
  id               BIGSERIAL PRIMARY KEY,
  label_id         BIGINT NOT NULL REFERENCES gs1_labels(id) ON DELETE CASCADE,
  verify_code      VARCHAR(16) UNIQUE NOT NULL,
  serial_no        INT NOT NULL,
  scan_count       INT NOT NULL DEFAULT 0,
  first_scanned_at TIMESTAMPTZ,
  first_scan_city  VARCHAR(100),
  first_scan_ip    INET,
  status           VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (label_id, serial_no)
);

CREATE INDEX IF NOT EXISTS idx_gs1_label_units_label ON gs1_label_units (label_id, serial_no);

-- Scan log now keyed on the physical unit, not the label definition.
CREATE TABLE IF NOT EXISTS gs1_unit_scan_logs (
  id              BIGSERIAL PRIMARY KEY,
  unit_id         BIGINT NOT NULL REFERENCES gs1_label_units(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_gs1_unit_scan_logs_unit ON gs1_unit_scan_logs (unit_id, scanned_at DESC);

DROP TABLE IF EXISTS gs1_scan_logs;

ALTER TABLE gs1_labels
  DROP COLUMN IF EXISTS verify_code,
  DROP COLUMN IF EXISTS scan_count,
  DROP COLUMN IF EXISTS first_scanned_at,
  DROP COLUMN IF EXISTS first_scan_city,
  DROP COLUMN IF EXISTS first_scan_ip,
  DROP COLUMN IF EXISTS status;
