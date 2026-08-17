-- Adds a Mã sản phẩm (product_code) lookup field to the Quy cách reference
-- table so /admin/gs1 can auto-fill it the same way it already auto-fills
-- GTIN and Kích thước when an admin picks a Quy cách.
ALTER TABLE gs1_size_specs ADD COLUMN IF NOT EXISTS product_code VARCHAR(100);
