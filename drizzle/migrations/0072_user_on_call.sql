-- Add isOnCall flag to users — technicians toggled "on call" by office staff
-- receive push + in-app alerts when an emergency call job is created.
-- Additive, non-destructive.
-- Run manually on Railway. PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `users` ADD COLUMN `isOnCall` tinyint NOT NULL DEFAULT 0;
