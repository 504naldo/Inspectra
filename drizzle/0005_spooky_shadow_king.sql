CREATE TABLE `inspection_checklist_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`sectionNumber` varchar(10) NOT NULL,
	`itemId` varchar(10) NOT NULL,
	`status` enum('PASS','DEFICIENT','NA') NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_checklist_responses_id` PRIMARY KEY(`id`)
);
