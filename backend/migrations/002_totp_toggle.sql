-- Add on/off toggle for TOTP 2FA per admin.
-- Existing admins default to TRUE (2FA required) - safer for existing accounts.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- If an admin was created without a totp_secret, mark 2FA as disabled
UPDATE admin_users SET totp_enabled = FALSE WHERE totp_secret = '';
