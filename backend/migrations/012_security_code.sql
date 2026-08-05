-- Manual-entry security code, independent from the QR's secret_code.
-- Printed/displayed alongside the QR so a unit can be identified even without scanning.
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS security_code VARCHAR(20) UNIQUE;
