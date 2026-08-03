-- 007: Hồ sơ khách hàng chi tiết
-- Bổ sung thông tin cơ bản (tên, email, địa chỉ, vị trí) vào customer_leads
-- để admin có cái nhìn đầy đủ về khách thay vì chỉ có SĐT.

ALTER TABLE customer_leads
  ADD COLUMN IF NOT EXISTS full_name  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS email      VARCHAR(160),
  ADD COLUMN IF NOT EXISTS address    TEXT,
  ADD COLUMN IF NOT EXISTS city       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS province   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Tìm kiếm theo tên khách (không phân biệt hoa thường)
CREATE INDEX IF NOT EXISTS idx_customer_leads_name
  ON customer_leads USING GIN (to_tsvector('simple', COALESCE(full_name, '')));

-- Truy vấn "khách này đã kích hoạt tem nào" chạy trên activated_phone
CREATE INDEX IF NOT EXISTS idx_qr_tokens_activated_phone
  ON qr_tokens (activated_phone) WHERE activated_phone IS NOT NULL;

DROP TRIGGER IF EXISTS trg_customer_leads_updated_at ON customer_leads;
CREATE TRIGGER trg_customer_leads_updated_at
  BEFORE UPDATE ON customer_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
