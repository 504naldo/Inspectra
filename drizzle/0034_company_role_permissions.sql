CREATE TABLE `company_role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`role` enum('office','technician','customer') NOT NULL,
	`permission` varchar(64) NOT NULL,
	`allowed` tinyint NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_role_permission_unique` UNIQUE(`companyId`,`role`,`permission`)
);
--> statement-breakpoint
CREATE INDEX `company_role_permissions_companyId_idx` ON `company_role_permissions` (`companyId`);