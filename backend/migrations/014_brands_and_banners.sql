CREATE TABLE IF NOT EXISTS brands (
  id             BIGSERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  website        VARCHAR(200),
  logo_file_type VARCHAR(4) CHECK (logo_file_type IN ('png','jpg')),
  logo_path      TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     BIGINT REFERENCES admin_users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands (is_active) WHERE is_active;
DROP TRIGGER IF EXISTS trg_brands_updated_at ON brands;
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES brands(id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand_id);

CREATE TABLE IF NOT EXISTS promo_banners (
  id           BIGSERIAL PRIMARY KEY,
  file_type    VARCHAR(4) NOT NULL CHECK (file_type IN ('png','jpg')),
  file_path    TEXT NOT NULL,
  link_url     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   BIGINT REFERENCES admin_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_banners_active ON promo_banners (is_active, sort_order, id) WHERE is_active;
