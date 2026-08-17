-- Add delivery address to orders (collected in step 2 of the "Buy more" form).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address VARCHAR(300);
