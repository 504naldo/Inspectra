CREATE TABLE `sprinkler_checklist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspectionId` int NOT NULL,
	`section` varchar(100) NOT NULL,
	`questionText` text NOT NULL,
	`questionOrder` int NOT NULL,
	`response` enum('YES','NO','NA'),
	`comment` text,
	`numberValue` int,
	`dateValue` date,
	`tempValue` varchar(50),
	`textValue` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sprinkler_checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sprinkler_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspectionId` int NOT NULL,
	`deviceOrder` int NOT NULL,
	`location` varchar(255) NOT NULL,
	`labelText` varchar(255),
	`deviceType` varchar(50),
	`address` varchar(100),
	`zone` varchar(100),
	`checkA` boolean,
	`checkB` boolean,
	`checkC` boolean,
	`checkD` boolean,
	`checkE` boolean,
	`checkF` boolean,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sprinkler_devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sprinkler_inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`inspectionDate` timestamp NOT NULL,
	`buildingId` varchar(50),
	`status` enum('draft','finalized') NOT NULL DEFAULT 'draft',
	`finalizedAt` timestamp,
	`finalizedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sprinkler_inspections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sprinkler_systems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspectionId` int NOT NULL,
	`systemNumber` int NOT NULL,
	`isWet` boolean DEFAULT false,
	`isDryPipePartialTest` boolean DEFAULT false,
	`isDryPipeFullFlowTest` boolean DEFAULT false,
	`isDeluge` boolean DEFAULT false,
	`isPreaction` boolean DEFAULT false,
	`isOther` boolean DEFAULT false,
	`otherDescription` text,
	`dateOfLastFullFlowTest` date,
	`dateOfLast5YearInternal` date,
	`areaOfCoverage` varchar(255),
	`size` varchar(100),
	`manufacturer` varchar(255),
	`model` varchar(255),
	`systemWaterPressure` varchar(50),
	`supplyWaterPressure` varchar(50),
	`residualPressure` varchar(50),
	`systemAirPressure` varchar(50),
	`lowAirSwitchCutIn` varchar(50),
	`tripPressure` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sprinkler_systems_id` PRIMARY KEY(`id`)
);
