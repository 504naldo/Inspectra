ALTER TABLE `quotes`
  ADD COLUMN `acceptTokenExpiresAt` timestamp NULL AFTER `acceptToken`;
