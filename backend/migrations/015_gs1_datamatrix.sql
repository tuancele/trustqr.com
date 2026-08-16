-- Standalone GS1 DataMatrix label module (/admin/gs1). Every field is typed
-- in by the admin — this table has no foreign key into batches/qr_tokens/
-- products, since the module is deliberately independent of the QR-token flow.
CREATE TABLE IF NOT EXISTS gs1_labels (
    id               BIGSERIAL PRIMARY KEY,
    gtin             VARCHAR(14) NOT NULL,
    manufacture_date DATE NOT NULL,
    expiry_date      DATE,
    lot              VARCHAR(50) NOT NULL,
    serial           VARCHAR(50) NOT NULL,
    product_name     VARCHAR(255),
    product_code     VARCHAR(50),
    spec             VARCHAR(100),
    unit             VARCHAR(20),
    manufacturer     VARCHAR(255),
    origin_country   VARCHAR(100),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (gtin, lot, serial)
);

CREATE INDEX IF NOT EXISTS idx_gs1_labels_gtin_lot ON gs1_labels (gtin, lot);
