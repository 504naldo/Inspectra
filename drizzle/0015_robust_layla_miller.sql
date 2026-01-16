ALTER TABLE `devices` ADD `companyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `category` enum('FIRE_EXTINGUISHER','EMERGENCY_LIGHT','FIRE_ALARM_DEVICE','SMOKE_ALARM');--> statement-breakpoint
ALTER TABLE `devices` ADD `externalRef` varchar(255);