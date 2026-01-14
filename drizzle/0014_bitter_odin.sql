CREATE TABLE `job_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('LEAD','ASSIST') NOT NULL DEFAULT 'ASSIST',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`assignedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_assignments_jobId_userId_unique` UNIQUE(`jobId`,`userId`)
);
