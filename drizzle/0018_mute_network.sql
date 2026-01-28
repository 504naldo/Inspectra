ALTER TABLE `devices` ADD `suiteNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `powerType` enum('hardwired','battery','sealed','unknown');--> statement-breakpoint
ALTER TABLE `devices` ADD `testResult` enum('pass','fail','no_access','na');