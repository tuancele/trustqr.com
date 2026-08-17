ALTER TABLE gs1_labels ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES brands(id);
CREATE INDEX IF NOT EXISTS idx_gs1_labels_brand ON gs1_labels (brand_id);
