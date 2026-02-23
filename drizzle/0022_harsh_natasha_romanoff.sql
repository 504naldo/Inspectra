ALTER TABLE `deficiencies` MODIFY COLUMN `systemCategory` enum('FIRE_ALARM','SMOKE_ALARM','FIRE_EXTINGUISHER','EMERGENCY_LIGHTING','SPRINKLER');--> statement-breakpoint
ALTER TABLE `companies` ADD `emailDomain` varchar(255);--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `estimatedCost` decimal(10,2);