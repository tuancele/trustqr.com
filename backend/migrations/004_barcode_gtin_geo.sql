-- Add barcode / GTIN fields to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin    VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_gtin    ON products (gtin)    WHERE gtin    IS NOT NULL;

-- Add device geolocation fields to scan_logs (from browser GPS)
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS device_lat DECIMAL(10, 7);
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS device_lng DECIMAL(10, 7);
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS device_accuracy DECIMAL(10, 2); -- meters
