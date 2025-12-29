ALTER TABLE `fire_alarm_checklist_templates` ADD `inputType` enum('checkbox','numeric','text','voltage','current','date','time','year') DEFAULT 'checkbox';--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `numericLabel` varchar(100);--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `numericUnit` varchar(50);--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `numericValue` varchar(100);--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `textValue` text;