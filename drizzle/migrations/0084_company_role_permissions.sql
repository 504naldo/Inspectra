-- Company-scoped per-role permission overrides.
-- Lets a company admin allow/deny individual permissions for the office,
-- technician, and customer roles within their own company, overriding the
-- baseline ROLE_PERMISSIONS in shared/permissions.ts. No row → baseline.
-- The `admin` role is never overridden (platform operator keeps all permissions).
--
-- Additive / non-destructive. Plain MySQL DDL; the startup runner ignores
-- ER_TABLE_EXISTS_ERROR / ER_DUP_KEYNAME, so re-runs are safe.
-- Mirrors journal migration drizzle/0034_company_role_permissions.sql.

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

CREATE INDEX `company_role_permissions_companyId_idx` ON `company_role_permissions` (`companyId`);
