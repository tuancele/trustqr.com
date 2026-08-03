-- Products catalog: single source of truth for product info.
-- Batches reference a product_id, and denormalize name for legacy compat.

CREATE TABLE IF NOT EXISTS products (
  id                  BIGSERIAL PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  short_description   TEXT,
  full_description    TEXT,
  ingredients         TEXT,
  usage_instructions  TEXT,
  warnings            TEXT,
  importer_company    VARCHAR(200),
  importer_address    TEXT,
  importer_phone      VARCHAR(50),
  origin_country      VARCHAR(100),
  volume              VARCHAR(50),        -- e.g. "10g", "50ml"
  license_number      VARCHAR(100),      -- Số công bố mỹ phẩm / TBYT
  image_url           TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          BIGINT REFERENCES admin_users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING GIN (to_tsvector('simple', name));

-- Add FK from batches to products (nullable for legacy batches).
ALTER TABLE batches ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches (product_id);

-- Backfill: create a placeholder product for existing batches so the flow works.
DO $$
DECLARE
  legacy_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM batches WHERE product_id IS NULL) THEN
    INSERT INTO products (name, short_description, importer_company, is_active)
    VALUES ('Yanhee Pink Gel 10g', 'Sản phẩm gel dưỡng da chính hãng Yanhee', 'Yanhee Việt Nam', TRUE)
    RETURNING id INTO legacy_id;
    UPDATE batches SET product_id = legacy_id WHERE product_id IS NULL;
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
