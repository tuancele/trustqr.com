-- AI(01)/GTIN now also accepts a 6-20 char alphanumeric FDA UDI Primary DI
-- Number (e.g. "D755FXS5007C0") for USA products with no real GS1 GTIN, so
-- the VARCHAR(14) columns need to be widened to fit the longest accepted
-- value (see gtinAlnumRe in internal/services/gs1.go).
ALTER TABLE gs1_labels ALTER COLUMN gtin TYPE VARCHAR(20);
ALTER TABLE gs1_size_specs ALTER COLUMN gtin TYPE VARCHAR(20);
