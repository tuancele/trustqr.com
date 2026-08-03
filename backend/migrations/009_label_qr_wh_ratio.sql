-- 009: Tách kích thước khung QR thành chiều rộng và chiều cao độc lập (thay vì
-- một cạnh vuông duy nhất) để admin tùy chỉnh linh hoạt hơn khi vị trí/kích
-- thước QR trên mẫu tem không nhất thiết phải là hình vuông chính xác theo mm.

ALTER TABLE label_templates RENAME COLUMN qr_size_ratio TO qr_w_ratio;

ALTER TABLE label_templates
  ADD COLUMN qr_h_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.25
    CHECK (qr_h_ratio > 0 AND qr_h_ratio <= 1);

-- Giữ nguyên hình vuông (theo mm) cho các mẫu tem đã tạo trước migration này.
UPDATE label_templates
SET qr_h_ratio = LEAST(1, qr_w_ratio * width_mm / height_mm);
