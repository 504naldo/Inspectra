ALTER TABLE `jobs`
  ADD COLUMN `tech_signature_url` text,
  ADD COLUMN `contact_signature_url` text,
  ADD COLUMN `contact_name` varchar(255),
  ADD COLUMN `contact_signed_at` timestamp,
  ADD COLUMN `tech_signed_at` timestamp;
