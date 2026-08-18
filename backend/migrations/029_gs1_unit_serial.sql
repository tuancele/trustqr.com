-- Serial Number (GS1 AI 21) must be unique per physical trade item, not
-- shared across a whole print run. Previously every unit exported from a
-- gs1_labels row was stamped with that row's single serial value, so 1000
-- printed stickers carried an identical DataMatrix/barcode serial. New units
-- (created from now on) get their own serial; NULL here means the unit
-- predates this change and callers should fall back to gs1_labels.serial.
ALTER TABLE gs1_label_units ADD COLUMN IF NOT EXISTS serial VARCHAR(20);
