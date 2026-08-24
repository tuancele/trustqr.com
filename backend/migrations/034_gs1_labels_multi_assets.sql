-- Replace the single product_image/document columns from 033 with proper
-- one-to-many tables — a label can have up to 4 real product photos and
-- multiple certification/document PDFs (IFU, CE mark, license, datasheet),
-- each addable/removable independently on the public /auth/:code verify page.
CREATE TABLE IF NOT EXISTS gs1_label_images (
    id SERIAL PRIMARY KEY,
    label_id BIGINT NOT NULL REFERENCES gs1_labels(id) ON DELETE CASCADE,
    image_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs1_label_images_label_id ON gs1_label_images(label_id);

CREATE TABLE IF NOT EXISTS gs1_label_documents (
    id SERIAL PRIMARY KEY,
    label_id BIGINT NOT NULL REFERENCES gs1_labels(id) ON DELETE CASCADE,
    document_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gs1_label_documents_label_id ON gs1_label_documents(label_id);

INSERT INTO gs1_label_images (label_id, image_path, file_type, sort_order)
SELECT id, product_image_path, COALESCE(product_image_file_type, 'jpg'), 0
FROM gs1_labels WHERE product_image_path IS NOT NULL;

INSERT INTO gs1_label_documents (label_id, document_path, file_name, sort_order)
SELECT id, document_path, document_file_name, 0
FROM gs1_labels WHERE document_path IS NOT NULL;

ALTER TABLE gs1_labels DROP COLUMN IF EXISTS product_image_path;
ALTER TABLE gs1_labels DROP COLUMN IF EXISTS product_image_file_type;
ALTER TABLE gs1_labels DROP COLUMN IF EXISTS document_path;
ALTER TABLE gs1_labels DROP COLUMN IF EXISTS document_file_name;
