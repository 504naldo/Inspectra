ALTER TABLE `deficiencies`
  MODIFY COLUMN `status` ENUM('open','in_progress','resolved','closed','deferred','quoted') NOT NULL DEFAULT 'open';
