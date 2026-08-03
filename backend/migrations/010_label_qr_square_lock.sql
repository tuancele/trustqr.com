-- 010: QR trên tem phải luôn là hình vuông (đúng bản chất mã QR), chỉ cho phép
-- admin chỉnh kích thước to/nhỏ và vị trí — không cho kéo méo thành chữ nhật.
-- Gộp lại qr_w_ratio/qr_h_ratio (thêm ở migration 009) thành một cạnh duy nhất.

ALTER TABLE label_templates RENAME COLUMN qr_w_ratio TO qr_size_ratio;
ALTER TABLE label_templates DROP COLUMN qr_h_ratio;
