ALTER TABLE `users`
  ADD COLUMN `sessionVersion` int NOT NULL DEFAULT 1 AFTER `googleTokenExpiry`;
