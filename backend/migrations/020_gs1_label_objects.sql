-- 020: Barcode + serial-text objects for GS1 label templates
-- Extends label_templates with an is_gs1 flag and position ratios for 3 more
-- objects the GS1 print flow composites alongside the existing QR:
--   - barcode: 1D Code128 image encoding the label's serial (AI 21), a
--     non-square rectangle (unlike the QR's locked square), so it gets
--     independent width/height ratios.
--   - text1/text2: the same serial value repeated as human-readable text at
--     two positions on the sticker (one physical printed sticker has 2 spots
--     that must show the serial). size_ratio is the font height as a ratio
--     of width_mm, mirroring qr_size_ratio's convention.
-- All ratios follow the same 0..1-of-width_mm/height_mm convention as
-- qr_x_ratio/qr_y_ratio/qr_size_ratio from migration 008.

ALTER TABLE label_templates
  ADD COLUMN IF NOT EXISTS is_gs1 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS barcode_x_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.10000 CHECK (barcode_x_ratio >= 0 AND barcode_x_ratio <= 1),
  ADD COLUMN IF NOT EXISTS barcode_y_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.42000 CHECK (barcode_y_ratio >= 0 AND barcode_y_ratio <= 1),
  ADD COLUMN IF NOT EXISTS barcode_w_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.55000 CHECK (barcode_w_ratio > 0 AND barcode_w_ratio <= 1),
  ADD COLUMN IF NOT EXISTS barcode_h_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.18000 CHECK (barcode_h_ratio > 0 AND barcode_h_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text1_x_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.10000 CHECK (text1_x_ratio >= 0 AND text1_x_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text1_y_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.61000 CHECK (text1_y_ratio >= 0 AND text1_y_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text1_size_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.04500 CHECK (text1_size_ratio > 0 AND text1_size_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text2_x_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.10000 CHECK (text2_x_ratio >= 0 AND text2_x_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text2_y_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.90000 CHECK (text2_y_ratio >= 0 AND text2_y_ratio <= 1),
  ADD COLUMN IF NOT EXISTS text2_size_ratio NUMERIC(6,5) NOT NULL DEFAULT 0.04500 CHECK (text2_size_ratio > 0 AND text2_size_ratio <= 1);
