-- 008: Thư viện mẫu tem in (label templates)
-- Cho phép admin tải lên file thiết kế tem (ảnh PNG/JPG hoặc SVG vector) theo
-- từng kích thước, đánh dấu vị trí QR sẽ ghép vào, để xuất file in sẵn sàng
-- gửi xưởng in (PDF dàn lưới cho ảnh, ZIP SVG cho vector).
--
-- qr_x_ratio/qr_y_ratio: góc trên-trái của khung QR, tính theo tỉ lệ (0..1)
--   của width_mm/height_mm — độc lập độ phân giải file gốc.
-- qr_size_ratio: cạnh khung QR (hình vuông) tính theo tỉ lệ của width_mm.

CREATE TABLE IF NOT EXISTS label_templates (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  width_mm      NUMERIC(8,3) NOT NULL CHECK (width_mm > 0),
  height_mm     NUMERIC(8,3) NOT NULL CHECK (height_mm > 0),
  file_type     VARCHAR(4)   NOT NULL CHECK (file_type IN ('png','jpg','svg')),
  file_path     TEXT         NOT NULL,
  qr_x_ratio    NUMERIC(6,5) NOT NULL DEFAULT 0.65 CHECK (qr_x_ratio >= 0 AND qr_x_ratio <= 1),
  qr_y_ratio    NUMERIC(6,5) NOT NULL DEFAULT 0.65 CHECK (qr_y_ratio >= 0 AND qr_y_ratio <= 1),
  qr_size_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.25 CHECK (qr_size_ratio > 0 AND qr_size_ratio <= 1),
  created_by    BIGINT REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_label_templates_created ON label_templates (created_at DESC);
