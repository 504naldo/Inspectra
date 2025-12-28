CREATE TABLE `fire_alarm_annunciators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fireAlarmSystemId` int NOT NULL,
	`location` varchar(255),
	`identification` varchar(255),
	`annunciatorType` enum('standard','sequential_display','remote_trouble') DEFAULT 'standard',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fire_alarm_annunciators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_checklist_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sectionName` varchar(255) NOT NULL,
	`sectionOrder` int NOT NULL,
	`itemLetter` varchar(10),
	`itemDescription` text NOT NULL,
	`requirementType` enum('inspection','test','both') DEFAULT 'both',
	`isRequired` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fire_alarm_checklist_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_control_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fireAlarmSystemId` int NOT NULL,
	`location` varchar(255),
	`identification` varchar(255),
	`unitType` enum('control_unit','transponder') DEFAULT 'control_unit',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fire_alarm_control_units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_inspection_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`fireAlarmSystemId` int NOT NULL,
	`checklistItemId` int NOT NULL,
	`result` enum('pass','fail','na','not_tested') DEFAULT 'not_tested',
	`notes` text,
	`testedById` int,
	`testedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fire_alarm_inspection_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_systems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` int NOT NULL,
	`manufacturer` varchar(255),
	`modelNumber` varchar(255),
	`operationType` enum('single_stage','two_stage','other') DEFAULT 'single_stage',
	`operationDescription` text,
	`connectedToMonitoring` boolean DEFAULT false,
	`monitoringCentreName` varchar(255),
	`monitoringCentrePhone` varchar(50),
	`systemFullyFunctional` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fire_alarm_systems_id` PRIMARY KEY(`id`)
);
