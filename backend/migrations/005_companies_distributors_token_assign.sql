-- Companies (manufacturer / brand owner shown on verify page)
CREATE TABLE IF NOT EXISTS companies (
  id           BIGSERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  tax_code     VARCHAR(50),
  address      TEXT,
  phone        VARCHAR(50),
  email        VARCHAR(200),
  website      VARCHAR(200),
  description  TEXT,
  logo_url     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   BIGINT REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (is_active) WHERE is_active;
DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link products → companies
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products (company_id);

-- Distributors (đại lý — different from distributor_boxes which is per-shipment)
CREATE TABLE IF NOT EXISTS distributors (
  id           BIGSERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200),
  phone        VARCHAR(50),
  email        VARCHAR(200),
  address      TEXT,
  city         VARCHAR(100),
  district     VARCHAR(100),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   BIGINT REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributors_active ON distributors (is_active) WHERE is_active;
DROP TRIGGER IF EXISTS trg_distributors_updated_at ON distributors;
CREATE TRIGGER trg_distributors_updated_at BEFORE UPDATE ON distributors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Token-level assignment: product + distributor + serial number within batch
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS product_id     BIGINT REFERENCES products(id);
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS distributor_id BIGINT REFERENCES distributors(id);
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS serial_no      INT;  -- position within batch, 1-based
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS is_ready       BOOLEAN NOT NULL DEFAULT FALSE; -- admin marked as ready-to-use

CREATE INDEX IF NOT EXISTS idx_qr_tokens_product     ON qr_tokens (product_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_distributor ON qr_tokens (distributor_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_batch_serial ON qr_tokens (batch_id, serial_no);

-- Backfill serial_no for existing tokens using window function
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY batch_id ORDER BY id) AS rn
  FROM qr_tokens WHERE serial_no IS NULL
)
UPDATE qr_tokens t SET serial_no = n.rn FROM numbered n WHERE t.id = n.id;

-- Backfill token.product_id from batch.product_id for legacy compat
UPDATE qr_tokens t SET product_id = b.product_id
FROM batches b WHERE t.batch_id = b.id AND t.product_id IS NULL AND b.product_id IS NOT NULL;

-- Backfill is_ready=TRUE for legacy tokens (already assigned to products via batch)
UPDATE qr_tokens SET is_ready = TRUE WHERE product_id IS NOT NULL;

-- Batch: product_id is now advisory (default product for tokens in this batch, but token can override)
-- Already nullable, no change needed.

-- Assignment log: track when ranges were assigned (audit)
CREATE TABLE IF NOT EXISTS token_assignments (
  id             BIGSERIAL PRIMARY KEY,
  batch_id       BIGINT NOT NULL REFERENCES batches(id),
  from_serial    INT NOT NULL,
  to_serial      INT NOT NULL,
  product_id     BIGINT REFERENCES products(id),
  distributor_id BIGINT REFERENCES distributors(id),
  tokens_updated INT NOT NULL,
  notes          TEXT,
  assigned_by    BIGINT REFERENCES admin_users(id),
  assigned_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_assignments_batch ON token_assignments (batch_id, from_serial);
