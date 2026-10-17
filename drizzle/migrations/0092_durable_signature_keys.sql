-- Add durable object references for newly captured signatures only.
-- Historical URL-only records remain null; do not infer or backfill sealed evidence.
ALTER TABLE `jobs` ADD `tech_signature_key` text;
ALTER TABLE `jobs` ADD `contact_signature_key` text;
