-- Add optional onCallUntil expiry to users — once this timestamp passes, the
-- technician is treated as off-call even if isOnCall wasn't manually toggled
-- back. NULL means no expiry (on-call until manually turned off).
-- Additive, non-destructive.
-- Run manually on Railway. PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `users` ADD COLUMN `onCallUntil` timestamp NULL;
