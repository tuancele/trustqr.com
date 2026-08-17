-- Brand-scoped reference table for GS1 "Quy cách" (REF code) -> GTIN / Kích
-- thước lookups, managed via /admin/sizes. Lets the GS1 label create form
-- auto-fill GTIN + Kích thước once an admin picks a Quy cách for a brand that
-- has data here. gtin is nullable because not every REF has a confirmed GTIN
-- yet (see "NOT FOUND" seed rows below); verified tracks whether an admin has
-- confirmed the GTIN against an authoritative source (e.g. FDA AccessGUDID).
CREATE TABLE IF NOT EXISTS gs1_size_specs (
    id           BIGSERIAL PRIMARY KEY,
    brand_id     BIGINT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    spec         VARCHAR(100) NOT NULL,
    size_spec    VARCHAR(100),
    gtin         VARCHAR(14),
    product_line VARCHAR(100),
    verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (brand_id, spec)
);

CREATE INDEX IF NOT EXISTS idx_gs1_size_specs_brand ON gs1_size_specs (brand_id);

-- Seed data for Dentium implant fixtures, sourced from FDA AccessGUDID
-- verification (Dentium_UDI_GTIN_AccessGUDID_Verified_v2.xlsx). GTIN is left
-- NULL where AccessGUDID had no matching record ("NOT FOUND") — admin fills
-- these in via /admin/sizes once verified elsewhere.
INSERT INTO gs1_size_specs (brand_id, spec, size_spec, gtin, product_line, verified)
SELECT b.id, v.spec, v.size_spec, v.gtin, v.product_line, v.verified
FROM brands b
CROSS JOIN (VALUES
  ('FX3607SW', '3.6mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine I', false),
  ('FXS3607', '3.7mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine II', false),
  ('FX3608SW', '3.6mm(⌀) x 8.0mm(L)', '08809162700016', 'SuperLine I', true),
  ('FXS3608', '3.7mm(⌀) x 8.0mm(L)', '08809460304602', 'SuperLine II', true),
  ('FX3610SW', '3.6mm(⌀) x 10.0mm(L)', '08809162700023', 'SuperLine I', true),
  ('FXS3610', '3.7mm(⌀) x 10.0mm(L)', '08809460304619', 'SuperLine II', true),
  ('FX3612SW', '3.6mm(⌀) x 12.0mm(L)', '08809162700030', 'SuperLine I', true),
  ('FXS3612', '3.7mm(⌀) x 12.0mm(L)', '08809460304626', 'SuperLine II', true),
  ('FX3614SW', '3.6mm(⌀) x 14.0mm(L)', '08809162700047', 'SuperLine I', true),
  ('FXS3614', '3.7mm(⌀) x 14.0mm(L)', '08809460304633', 'SuperLine II', true),
  ('FX4007SW', '4mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine I', false),
  ('FXS4007', '4mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine II', false),
  ('FX4008SW', '4mm(⌀) x 8.0mm(L)', '08809162700061', 'SuperLine I', true),
  ('FXS4008', '4mm(⌀) x 8.0mm(L)', '08809460304657', 'SuperLine II', true),
  ('FX4010SW', '4mm(⌀) x 10.0mm(L)', '08809162700078', 'SuperLine I', true),
  ('FXS4010', '4mm(⌀) x 10.0mm(L)', '08809460304664', 'SuperLine II', true),
  ('FX4012SW', '4mm(⌀) x 12.0mm(L)', '08809162700085', 'SuperLine I', true),
  ('FXS4012', '4mm(⌀) x 12.0mm(L)', '08809460304671', 'SuperLine II', true),
  ('FX4014SW', '4mm(⌀) x 14.0mm(L)', '08809162700092', 'SuperLine I', true),
  ('FXS4014', '4mm(⌀) x 14.0mm(L)', '08809460304688', 'SuperLine II', true),
  ('FX4507SW', '4.5mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine I', false),
  ('FXS4507', '4.5mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine II', false),
  ('FX4508SW', '4.5mm(⌀) x 8.0mm(L)', '08809162700115', 'SuperLine I', true),
  ('FXS4508', '4.5mm(⌀) x 8.0mm(L)', '08809460304701', 'SuperLine II', true),
  ('FX4510SW', '4.5mm(⌀) x 10.0mm(L)', '08809162700122', 'SuperLine I', true),
  ('FXS4510', '4.5mm(⌀) x 10.0mm(L)', '08809460304718', 'SuperLine II', true),
  ('FX4512SW', '4.5mm(⌀) x 12.0mm(L)', '08809162700139', 'SuperLine I', true),
  ('FXS4512', '4.5mm(⌀) x 12.0mm(L)', '08809460304725', 'SuperLine II', true),
  ('FX4514SW', '4.5mm(⌀) x 14.0mm(L)', '08809162700146', 'SuperLine I', true),
  ('FXS4514', '4.5mm(⌀) x 14.0mm(L)', '08809460304732', 'SuperLine II', true),
  ('FX5007SW', '5mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine I', false),
  ('FXS5007', '5mm(⌀) x 7.0mm(L)', NULL::varchar, 'SuperLine II', false),
  ('FX5008SW', '5mm(⌀) x 8.0mm(L)', '08809162700160', 'SuperLine I', true),
  ('FXS5008', '5mm(⌀) x 8.0mm(L)', '08809460304756', 'SuperLine II', true),
  ('FX5010SW', '5mm(⌀) x 10.0mm(L)', '08809162700177', 'SuperLine I', true),
  ('FXS5010', '5mm(⌀) x 10.0mm(L)', '08809460304763', 'SuperLine II', true),
  ('FX5012SW', '5mm(⌀) x 12.0mm(L)', '08809162700184', 'SuperLine I', true),
  ('FXS5012', '5mm(⌀) x 12.0mm(L)', '08809460304770', 'SuperLine II', true)
) AS v(spec, size_spec, gtin, product_line, verified)
WHERE b.name = 'Dentium'
ON CONFLICT (brand_id, spec) DO NOTHING;
