-- Per-template saved print-export defaults (sheet size, margin, gutter, QR
-- resolution, background color, cutline/eke settings) so the admin doesn't
-- have to re-enter the same values every time they export labels for a
-- template they've already tuned. NULL means "no saved defaults yet" — the
-- frontend keeps its hardcoded fallback defaults in that case.
ALTER TABLE label_templates
  ADD COLUMN IF NOT EXISTS print_settings JSONB;
