-- Allow multiple GS1 labels to share the same GTIN + Lot + Serial. Some
-- admins re-enter the same lot for several physical units before serials
-- are finalized, and the strict uniqueness was blocking legitimate re-entry.
ALTER TABLE gs1_labels DROP CONSTRAINT IF EXISTS gs1_labels_gtin_lot_serial_key;
