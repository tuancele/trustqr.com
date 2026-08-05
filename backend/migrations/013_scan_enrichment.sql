-- Device/OS/browser (parsed from User-Agent), free-form signals (Accept-Language, Referer),
-- an anonymous per-browser visitor cookie, and screen/timezone info collected on the GPS
-- enrichment follow-up. No backfill for existing rows — dashboards must COALESCE to "unknown".
ALTER TABLE scan_logs
  ADD COLUMN IF NOT EXISTS device_type     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS os_name         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS os_version      VARCHAR(30),
  ADD COLUMN IF NOT EXISTS browser_name    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS browser_version VARCHAR(30),
  ADD COLUMN IF NOT EXISTS accept_language TEXT,
  ADD COLUMN IF NOT EXISTS referer         TEXT,
  ADD COLUMN IF NOT EXISTS visitor_id      VARCHAR(36),
  ADD COLUMN IF NOT EXISTS screen_width    INT,
  ADD COLUMN IF NOT EXISTS screen_height   INT,
  ADD COLUMN IF NOT EXISTS timezone        VARCHAR(100);
