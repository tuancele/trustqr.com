-- 021: Flexible text_objects list for GS1 label templates + size_spec field
-- Migration 020 gave every GS1 template exactly 2 fixed text slots
-- (text1_*/text2_*), both always showing the serial. The admin now needs to
-- position an arbitrary set of fields (GTIN, Lot, Serial x2, Manufacture
-- Date, Expiry Date, Product Code, Spec, Size Spec) each with its own font
-- weight and optional 180-degree rotation, so the fixed columns are replaced
-- by a single JSONB array. Existing text1/text2 data is preserved as two
-- "serial" text objects before the old columns are dropped.

ALTER TABLE gs1_labels
  ADD COLUMN IF NOT EXISTS size_spec TEXT;

ALTER TABLE label_templates
  ADD COLUMN IF NOT EXISTS text_objects JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE label_templates
SET text_objects = jsonb_build_array(
  jsonb_build_object(
    'id', 'text1', 'field', 'serial',
    'x_ratio', text1_x_ratio, 'y_ratio', text1_y_ratio, 'size_ratio', text1_size_ratio,
    'bold', false, 'rotate_180', true
  ),
  jsonb_build_object(
    'id', 'text2', 'field', 'serial',
    'x_ratio', text2_x_ratio, 'y_ratio', text2_y_ratio, 'size_ratio', text2_size_ratio,
    'bold', true, 'rotate_180', false
  )
)
WHERE is_gs1 = true;

ALTER TABLE label_templates
  DROP COLUMN IF EXISTS text1_x_ratio,
  DROP COLUMN IF EXISTS text1_y_ratio,
  DROP COLUMN IF EXISTS text1_size_ratio,
  DROP COLUMN IF EXISTS text2_x_ratio,
  DROP COLUMN IF EXISTS text2_y_ratio,
  DROP COLUMN IF EXISTS text2_size_ratio;
