-- Cutline (die-line) SVG uploaded separately per template: a designer-prepared
-- vector tracing the label's true physical cut silhouette, used to generate a
-- dedicated cutline page for laser-cutting machines at print export time.
ALTER TABLE label_templates ADD COLUMN IF NOT EXISTS cutline_file_path TEXT;
