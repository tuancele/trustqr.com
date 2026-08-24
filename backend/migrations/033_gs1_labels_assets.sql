-- Real product photo + certification/document (IFU, CE mark, license, datasheet)
-- attached to a GS1 label definition, shown on the public /auth/:code verify page.
ALTER TABLE gs1_labels ADD COLUMN IF NOT EXISTS product_image_path VARCHAR(500);
ALTER TABLE gs1_labels ADD COLUMN IF NOT EXISTS product_image_file_type VARCHAR(10);
ALTER TABLE gs1_labels ADD COLUMN IF NOT EXISTS document_path VARCHAR(500);
ALTER TABLE gs1_labels ADD COLUMN IF NOT EXISTS document_file_name VARCHAR(255);
