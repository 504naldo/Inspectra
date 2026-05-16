-- AI Reviews v2: add companyId scoping, reviewType, status, summary, riskLevel, structured findings.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

ALTER TABLE `ai_reviews`
  ADD COLUMN `companyId` INT DEFAULT NULL,
  ADD COLUMN `reviewType` VARCHAR(50) NOT NULL DEFAULT 'pre_publish',
  ADD COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'completed',
  ADD COLUMN `summary` TEXT DEFAULT NULL,
  ADD COLUMN `riskLevel` ENUM('low','medium','high','critical') DEFAULT 'low',
  ADD COLUMN `suggestedQaNote` TEXT DEFAULT NULL,
  ADD COLUMN `findingsJson` JSON DEFAULT NULL,
  ADD COLUMN `suggestedActions` JSON DEFAULT NULL,
  ADD COLUMN `createdById` INT DEFAULT NULL;
