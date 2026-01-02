ALTER TABLE `sprinkler_systems` MODIFY COLUMN `systemWaterPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` MODIFY COLUMN `supplyWaterPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` MODIFY COLUMN `residualPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` MODIFY COLUMN `systemAirPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` MODIFY COLUMN `lowAirSwitchCutIn` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` MODIFY COLUMN `tripPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `waterPressureAtBaseOfRiser` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `tripTime` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `waterDeliveryTime` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `gaugeYear` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `gaugeCondition` text;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `compressorMakeModel` varchar(255);--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `compressorCutInPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `compressorCutOutPressure` int;--> statement-breakpoint
ALTER TABLE `sprinkler_systems` ADD `notes` text;