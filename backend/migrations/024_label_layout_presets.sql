-- Saved GS1 object-position layouts (QR + barcode + text objects) so an
-- admin can reuse a finished arrangement on a different label template
-- instead of repositioning everything by hand every time.
CREATE TABLE IF NOT EXISTS label_layout_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    qr_x_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    qr_y_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    qr_size_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    barcode_x_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    barcode_y_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.42,
    barcode_w_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    barcode_h_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.18,
    text_objects JSONB NOT NULL DEFAULT '[]',
    created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
