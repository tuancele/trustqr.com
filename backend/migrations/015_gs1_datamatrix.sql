-- GS1 DataMatrix module: fields needed to encode (01) GTIN / (11) mfg date /
-- (17) exp date / (10) lot / (21) serial, matching the AI structure printed
-- on Dentium's UDI label. Kept separate from the existing qr_tokens URL flow.

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code VARCHAR(50); -- Mã sản phẩm
ALTER TABLE products ADD COLUMN IF NOT EXISTS spec         VARCHAR(100); -- Quy cách
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit         VARCHAR(20); -- Đơn vị

ALTER TABLE batches ADD COLUMN IF NOT EXISTS manufacture_date DATE; -- Ngày sản xuất (AI 11)
ALTER TABLE batches ADD COLUMN IF NOT EXISTS expiry_date      DATE; -- Hạn sử dụng (AI 17)

ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS gs1_serial VARCHAR(20) UNIQUE; -- Serial (AI 21), independent of serial_no
CREATE INDEX IF NOT EXISTS idx_qr_tokens_gs1_serial ON qr_tokens (gs1_serial);
