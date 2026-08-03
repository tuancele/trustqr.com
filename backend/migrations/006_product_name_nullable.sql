-- Batch can be created without product (product assigned per-range later)
ALTER TABLE batches ALTER COLUMN product_name DROP NOT NULL;
