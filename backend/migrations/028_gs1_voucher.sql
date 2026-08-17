-- Lead-capture voucher on the GS1 verify page (/auth/:code), mirroring the
-- QR flow's qr_tokens activation fields but scoped to gs1_label_units.
ALTER TABLE gs1_label_units
  ADD COLUMN IF NOT EXISTS is_activated      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activated_name    VARCHAR(120),
  ADD COLUMN IF NOT EXISTS activated_phone   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS activated_voucher VARCHAR(20),
  ADD COLUMN IF NOT EXISTS activated_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gs1_label_units_activated_phone
  ON gs1_label_units (activated_phone) WHERE activated_phone IS NOT NULL;
