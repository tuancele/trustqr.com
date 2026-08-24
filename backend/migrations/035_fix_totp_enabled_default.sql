-- New admin_users rows must start with 2FA "not configured" (disabled),
-- matching reality (no secret yet). The old DEFAULT TRUE only made sense
-- for migration 002's one-time backfill of pre-existing accounts — every
-- admin created since then inherited totp_enabled=TRUE with an empty
-- secret, which made the frontend think 2FA was already on and hide the
-- "Enable 2FA" button behind what looked like a "Disable 2FA" toggle.
ALTER TABLE admin_users ALTER COLUMN totp_enabled SET DEFAULT FALSE;

-- Repair any admin already created with the stale TRUE default and no secret.
UPDATE admin_users SET totp_enabled = FALSE WHERE totp_secret = '' AND totp_enabled = TRUE;
