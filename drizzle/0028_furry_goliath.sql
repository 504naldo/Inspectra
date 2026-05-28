CREATE TABLE `activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`actorUserId` int,
	`actorName` varchar(255),
	`actorRole` varchar(64),
	`entityType` varchar(64) NOT NULL,
	`entityId` int NOT NULL,
	`relatedEntityType` varchar(64),
	`relatedEntityId` int,
	`eventType` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`oldValue` text,
	`newValue` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agreement_sites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`agreementId` int NOT NULL,
	`siteId` int NOT NULL,
	`includedServicesJson` json,
	`siteSpecificNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agreement_sites_id` PRIMARY KEY(`id`),
	CONSTRAINT `agreement_sites_unique` UNIQUE(`agreementId`,`siteId`)
);
--> statement-breakpoint
CREATE TABLE `approved_work` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`customerOrgId` int,
	`siteId` int,
	`jobId` int,
	`deficiencyId` int,
	`quoteId` int,
	`quoteItemId` int,
	`workOrderId` int,
	`type` enum('job_order','repair_order') NOT NULL,
	`status` enum('approved','ready_to_schedule','scheduled','assigned','in_progress','parts_required','awaiting_parts','parts_ordered','parts_received','completed','report_pending','invoiced','closed','cancelled') NOT NULL DEFAULT 'approved',
	`approvedScope` text,
	`approvedAmount` decimal(10,2),
	`approvedAt` timestamp,
	`approvedByName` varchar(255),
	`approvedByEmail` varchar(320),
	`approvalSource` enum('email','phone','signed_pdf','in_person','portal','internal'),
	`assignedTechnicianIds` json DEFAULT ('[]'),
	`scheduledDate` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`closedAt` timestamp,
	`partsStatus` varchar(100),
	`invoiceNumber` varchar(100),
	`invoicedAt` timestamp,
	`invoiceStatus` varchar(100),
	`officeNotes` text,
	`technicianNotes` text,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approved_work_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_lifecycle_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int NOT NULL,
	`deviceId` int NOT NULL,
	`eventType` enum('installed','inspected','passed','failed','deficiency_created','repaired','replaced','removed_from_service','maintenance_completed','parts_replaced','recommended_replacement','warranty_expired','other') NOT NULL,
	`eventDate` date NOT NULL,
	`sourceType` enum('job','inspection_result','deficiency','repair_quote','approved_work','work_order','manual') DEFAULT 'manual',
	`sourceId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`performedById` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asset_lifecycle_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`companyDisplayName` varchar(255),
	`logoUrl` varchar(500),
	`gstRate` decimal(5,4) NOT NULL DEFAULT '0.0500',
	`pstRate` decimal(5,4) NOT NULL DEFAULT '0.0700',
	`technicianLabourRate` decimal(8,2) NOT NULL DEFAULT '75.00',
	`fitterLabourRate` decimal(8,2) NOT NULL DEFAULT '65.00',
	`defaultFuelCharge` decimal(8,2) NOT NULL DEFAULT '0.00',
	`quoteValidityDays` int NOT NULL DEFAULT 30,
	`defaultQuoteTerms` text,
	`invoiceDueDays` int NOT NULL DEFAULT 30,
	`defaultInvoiceTerms` text,
	`invoiceNumberPrefix` varchar(20) NOT NULL DEFAULT 'INV',
	`repairQuoteNumberPrefix` varchar(20) NOT NULL DEFAULT 'RQ',
	`sageDefaultGlCode` varchar(50),
	`sageDefaultDepartment` varchar(50),
	`sageCustomerCodeDefault` varchar(50),
	`sageTaxCodeDefault` varchar(50),
	`reportFooterText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_settings_companyId_unique` UNIQUE(`companyId`)
);
--> statement-breakpoint
CREATE TABLE `customer_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`customerOrgId` int,
	`siteId` int,
	`name` varchar(255) NOT NULL,
	`title` varchar(255),
	`companyName` varchar(255),
	`email` varchar(320),
	`phone` varchar(50),
	`mobile` varchar(50),
	`role` enum('property_manager','strata_manager','building_manager','site_contact','billing_contact','quote_approver','report_recipient','emergency_contact','tenant_contact','other') NOT NULL DEFAULT 'other',
	`isPrimary` tinyint NOT NULL DEFAULT 0,
	`receivesReports` tinyint NOT NULL DEFAULT 0,
	`receivesQuotes` tinyint NOT NULL DEFAULT 0,
	`receivesInvoices` tinyint NOT NULL DEFAULT 0,
	`receivesServiceUpdates` tinyint NOT NULL DEFAULT 0,
	`receivesComplianceNotices` tinyint NOT NULL DEFAULT 0,
	`isSiteAccessContact` tinyint NOT NULL DEFAULT 0,
	`preferredMethod` enum('email','phone','mobile','none','other') NOT NULL DEFAULT 'email',
	`notes` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_availability_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('vacation','sick','personal','training','stat_holiday','unavailable','available_override','other') NOT NULL DEFAULT 'vacation',
	`status` enum('requested','approved','rejected','cancelled') NOT NULL DEFAULT 'requested',
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`startTime` varchar(8),
	`endTime` varchar(8),
	`allDay` tinyint NOT NULL DEFAULT 1,
	`reason` varchar(500) NOT NULL DEFAULT '',
	`employeeNotes` text,
	`adminNotes` text,
	`requestedAt` timestamp,
	`reviewedById` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_availability_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedback_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`submittedById` int NOT NULL,
	`assignedToId` int,
	`type` enum('bug','feature_request','confusing_workflow','data_issue','report_output_issue','mobile_issue','performance_issue','other') NOT NULL DEFAULT 'other',
	`status` enum('new','reviewed','in_progress','resolved','closed','wont_fix') NOT NULL DEFAULT 'new',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`title` varchar(255) NOT NULL,
	`description` text,
	`pageUrl` varchar(500),
	`routeName` varchar(200),
	`entityType` varchar(100),
	`entityId` int,
	`browserInfo` varchar(500),
	`deviceInfo` varchar(200),
	`adminNotes` text,
	`resolvedAt` timestamp,
	`resolvedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feedback_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_template_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`templateId` int NOT NULL,
	`jobType` varchar(50),
	`systemType` varchar(50),
	`siteId` int,
	`customerOrgId` int,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_template_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_template_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`templateId` int NOT NULL,
	`sectionId` int NOT NULL,
	`itemCode` varchar(50),
	`questionText` text NOT NULL,
	`helpText` text,
	`responseType` varchar(50) NOT NULL DEFAULT 'pass_fail_na',
	`isRequired` tinyint NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`deficiencyTrigger` json,
	`options` json,
	`codeReference` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_template_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_template_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`jobId` int NOT NULL,
	`templateId` int NOT NULL,
	`sectionId` int NOT NULL,
	`itemId` int NOT NULL,
	`responseValue` varchar(100),
	`responseText` text,
	`notes` text,
	`deficiencyId` int,
	`answeredById` int,
	`answeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_template_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `itr_job_item_unique` UNIQUE(`jobId`,`itemId`)
);
--> statement-breakpoint
CREATE TABLE `inspection_template_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`templateId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isRequired` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_template_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`systemType` varchar(50) NOT NULL DEFAULT 'general',
	`inspectionType` varchar(50) NOT NULL DEFAULT 'annual',
	`frequency` varchar(50) NOT NULL DEFAULT 'annual',
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`isDefault` tinyint NOT NULL DEFAULT 0,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`partsCatalogId` int,
	`sku` varchar(100),
	`category` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`unitCost` decimal(10,2) DEFAULT '0',
	`unitPrice` decimal(10,2) DEFAULT '0',
	`quantityOnHand` int NOT NULL DEFAULT 0,
	`quantityReserved` int NOT NULL DEFAULT 0,
	`reorderPoint` int NOT NULL DEFAULT 0,
	`reorderQuantity` int NOT NULL DEFAULT 0,
	`storageLocation` varchar(255),
	`supplierName` varchar(255),
	`supplierPartNumber` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`inventoryItemId` int NOT NULL,
	`transactionType` enum('initial_count','adjustment','reserved','unreserved','ordered','received','issued','used','returned','removed') NOT NULL,
	`quantity` int NOT NULL,
	`sourceType` varchar(64),
	`sourceId` int,
	`notes` text,
	`performedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`sortOrder` int DEFAULT 0,
	`description` text NOT NULL,
	`quantity` decimal(10,2) DEFAULT '1',
	`unitPrice` decimal(10,2) DEFAULT '0',
	`total` decimal(10,2) DEFAULT '0',
	`taxable` boolean DEFAULT true,
	`sageGlCode` varchar(50),
	`sageDepartment` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`invoiceNumber` varchar(50) NOT NULL,
	`customerOrgId` int,
	`siteId` int,
	`jobId` int,
	`approvedWorkId` int,
	`workOrderId` int,
	`quoteId` int,
	`status` enum('draft','sent','viewed','approved','paid','partial','overdue','void') NOT NULL DEFAULT 'draft',
	`billToName` varchar(255),
	`billToAddress` text,
	`billToCity` varchar(100),
	`billToState` varchar(100),
	`billToPostalCode` varchar(20),
	`billToEmail` varchar(320),
	`invoiceDate` timestamp,
	`dueDate` timestamp,
	`paidAt` timestamp,
	`sentAt` timestamp,
	`subtotal` decimal(10,2) DEFAULT '0',
	`taxRate` decimal(5,4) DEFAULT '0',
	`taxAmount` decimal(10,2) DEFAULT '0',
	`total` decimal(10,2) DEFAULT '0',
	`amountPaid` decimal(10,2) DEFAULT '0',
	`balanceDue` decimal(10,2) DEFAULT '0',
	`sageCustomerCode` varchar(50),
	`sageGlCode` varchar(50),
	`sageDepartment` varchar(50),
	`sageExportedAt` timestamp,
	`sageExportStatus` enum('pending','exported','error') DEFAULT 'pending',
	`internalNotes` text,
	`clientNotes` text,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int,
	`roleTarget` varchar(20),
	`entityType` varchar(64),
	`entityId` int,
	`type` varchar(64) NOT NULL,
	`severity` enum('info','warning','urgent','critical') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`message` text,
	`href` varchar(500),
	`isRead` tinyint NOT NULL DEFAULT 0,
	`readAt` timestamp,
	`isDismissed` tinyint NOT NULL DEFAULT 0,
	`dismissedAt` timestamp,
	`dedupeKey` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`metadataJson` json,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`category` varchar(100) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`sku` varchar(100),
	`unitPrice` decimal(10,2) NOT NULL DEFAULT '0',
	`defaultLabourHours` decimal(5,2) DEFAULT '0',
	`taxableGst` tinyint NOT NULL DEFAULT 1,
	`taxablePst` tinyint NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`description` text,
	`sourceWorkbook` varchar(255),
	`sourceSheet` varchar(100),
	`sourceRow` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parts_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `parts_catalog_unique_cat_product` UNIQUE(`companyId`,`category`,`productName`)
);
--> statement-breakpoint
CREATE TABLE `parts_request_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`partsRequestId` int NOT NULL,
	`inventoryItemId` int,
	`partsCatalogId` int,
	`description` varchar(500) NOT NULL,
	`quantityRequested` int NOT NULL DEFAULT 1,
	`quantityApproved` int NOT NULL DEFAULT 0,
	`quantityOrdered` int NOT NULL DEFAULT 0,
	`quantityReceived` int NOT NULL DEFAULT 0,
	`quantityUsed` int NOT NULL DEFAULT 0,
	`unitCost` decimal(10,2),
	`unitPrice` decimal(10,2),
	`status` enum('requested','approved','ordered','received','issued','used','unavailable','cancelled') NOT NULL DEFAULT 'requested',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parts_request_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`requestNumber` varchar(50) NOT NULL,
	`status` enum('draft','submitted','approved','ordered','partially_received','received','issued','used','cancelled') NOT NULL DEFAULT 'draft',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`requestedById` int NOT NULL,
	`assignedToId` int,
	`customerOrgId` int,
	`siteId` int,
	`jobId` int,
	`workOrderId` int,
	`approvedWorkId` int,
	`deficiencyId` int,
	`notes` text,
	`neededByDate` date,
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`approvedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parts_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_time_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`entryDate` date NOT NULL,
	`payPeriodStart` date,
	`payPeriodEnd` date,
	`startTime` varchar(8),
	`endTime` varchar(8),
	`breakMinutes` int NOT NULL DEFAULT 0,
	`regularMinutes` int NOT NULL,
	`overtimeMinutes` int,
	`totalMinutes` int NOT NULL,
	`workType` enum('regular_work','job_site','travel','office_admin','shop_time','inventory','training','meeting','sick_time','vacation','stat_holiday','unpaid_time','other') NOT NULL DEFAULT 'regular_work',
	`status` enum('draft','submitted','approved','rejected','exported','locked') NOT NULL DEFAULT 'draft',
	`jobId` int,
	`workOrderId` int,
	`approvedWorkId` int,
	`siteId` int,
	`customerOrgId` int,
	`description` varchar(1000) NOT NULL DEFAULT '',
	`employeeNotes` text,
	`adminNotes` text,
	`submittedAt` timestamp,
	`approvedById` int,
	`approvedAt` timestamp,
	`rejectedById` int,
	`rejectedAt` timestamp,
	`rejectionReason` text,
	`exportedAt` timestamp,
	`exportedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_time_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`inventoryItemId` int,
	`partsCatalogId` int,
	`partsRequestItemId` int,
	`description` varchar(500) NOT NULL,
	`quantityOrdered` int NOT NULL DEFAULT 1,
	`quantityReceived` int NOT NULL DEFAULT 0,
	`unitCost` decimal(10,2) DEFAULT '0',
	`lineTotal` decimal(10,2) DEFAULT '0',
	`supplierPartNumber` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`poNumber` varchar(50) NOT NULL,
	`vendorId` int,
	`status` enum('draft','ready_to_order','ordered','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`partsRequestId` int,
	`orderDate` date,
	`expectedDate` date,
	`receivedDate` date,
	`requestedById` int,
	`createdById` int NOT NULL,
	`notes` text,
	`internalNotes` text,
	`subtotal` decimal(10,2) DEFAULT '0',
	`tax` decimal(10,2) DEFAULT '0',
	`shipping` decimal(10,2) DEFAULT '0',
	`total` decimal(10,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repair_quote_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`deficiencyId` int,
	`description` varchar(500) NOT NULL,
	`repairNotes` text,
	`systemType` enum('FIRE_ALARM','SMOKE_ALARM','FIRE_EXTINGUISHER','EMERGENCY_LIGHTING','SPRINKLER','BACKFLOW','OTHER'),
	`location` varchar(255),
	`quantity` int NOT NULL DEFAULT 1,
	`partId` int,
	`partDescription` varchar(255),
	`partUnitPrice` decimal(10,2) DEFAULT '0',
	`partTotal` decimal(10,2) DEFAULT '0',
	`techHours` decimal(6,2) DEFAULT '0',
	`fitterHours` decimal(6,2) DEFAULT '0',
	`techLabourRate` decimal(8,2) DEFAULT '0',
	`fitterLabourRate` decimal(8,2) DEFAULT '0',
	`labourTotal` decimal(10,2) DEFAULT '0',
	`fuelCharge` decimal(8,2) DEFAULT '0',
	`backflowReportFee` decimal(8,2) DEFAULT '0',
	`gst` decimal(10,2) DEFAULT '0',
	`pst` decimal(10,2) DEFAULT '0',
	`total` decimal(10,2) DEFAULT '0',
	`sortOrder` int DEFAULT 0,
	`approvalStatus` enum('pending','approved','declined','needs_review','converted_to_approved_work') NOT NULL DEFAULT 'pending',
	`customerNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repair_quote_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_agreements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`customerOrgId` int NOT NULL,
	`agreementNumber` varchar(50),
	`name` varchar(255) NOT NULL,
	`status` enum('draft','active','expiring_soon','expired','cancelled') NOT NULL DEFAULT 'draft',
	`startDate` date,
	`endDate` date,
	`renewalDate` date,
	`billingCycle` enum('monthly','quarterly','semi_annual','annual','per_service','custom') DEFAULT 'annual',
	`billingNotes` text,
	`internalNotes` text,
	`includedServicesJson` json,
	`excludedServicesJson` json,
	`documentUrl` varchar(500),
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_agreements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `setup_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`stepKey` varchar(50) NOT NULL,
	`status` enum('not_started','in_progress','completed','skipped') NOT NULL DEFAULT 'not_started',
	`completedAt` timestamp,
	`completedById` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `setup_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `setup_progress_company_step_unique` UNIQUE(`companyId`,`stepKey`)
);
--> statement-breakpoint
CREATE TABLE `site_work_site_info` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int NOT NULL,
	`customerOrgId` int,
	`siteContactName` varchar(255),
	`siteContactPhone` varchar(50),
	`siteContactEmail` varchar(320),
	`propertyManagerName` varchar(255),
	`propertyManagerPhone` varchar(50),
	`propertyManagerEmail` varchar(320),
	`accessNotes` text,
	`keyLocation` text,
	`keyNumber` varchar(50),
	`lockboxCode` varchar(50),
	`parkingNotes` text,
	`serviceEntranceNotes` text,
	`fireAlarmPanelMake` varchar(100),
	`fireAlarmPanelModel` varchar(100),
	`fireAlarmPanelLocation` text,
	`annunciatorLocation` text,
	`monitoringCompany` varchar(255),
	`monitoringPhone` varchar(50),
	`monitoringAccount` varchar(100),
	`sprinklerNotes` text,
	`backflowNotes` text,
	`emergencyLightingNotes` text,
	`fireExtinguisherNotes` text,
	`generalNotes` text,
	`lastImportedFromWorkbook` timestamp,
	`sourceWorkbookName` varchar(255),
	`sourceSheetName` varchar(100),
	`sourceUpdatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_work_site_info_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_work_site_info_siteId_unique` UNIQUE(`siteId`)
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`jobId` int,
	`workOrderId` int,
	`approvedWorkId` int,
	`siteId` int,
	`customerOrgId` int,
	`entryDate` date NOT NULL,
	`startTime` varchar(8),
	`endTime` varchar(8),
	`durationMinutes` int NOT NULL,
	`labourType` enum('inspection','repair','service_call','travel','admin','parts_run','other') NOT NULL DEFAULT 'inspection',
	`status` enum('draft','submitted','approved','rejected','invoiced') NOT NULL DEFAULT 'draft',
	`description` varchar(1000) NOT NULL DEFAULT '',
	`internalNotes` text,
	`approvedById` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`contactName` varchar(255),
	`email` varchar(255),
	`phone` varchar(50),
	`website` varchar(500),
	`address` text,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int NOT NULL,
	`customerOrgId` int NOT NULL,
	`jobId` int NOT NULL,
	`quoteId` int,
	`assignedTechnicianIds` json NOT NULL DEFAULT ('[]'),
	`workOrderNumber` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`workType` enum('inspection','repair','service_call','maintenance','emergency') NOT NULL DEFAULT 'inspection',
	`status` enum('pending','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`scheduledDate` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`estimatedHours` decimal(5,2),
	`actualHours` decimal(5,2),
	`materialsUsed` json,
	`techNotes` text,
	`officeNotes` text,
	`completionSummary` text,
	`lineItems` json,
	`total` decimal(10,2) NOT NULL DEFAULT '0',
	`finalizedAt` timestamp,
	`finalizedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `knowledge_base` MODIFY COLUMN `category` varchar(50) NOT NULL DEFAULT 'other';--> statement-breakpoint
ALTER TABLE `quotes` MODIFY COLUMN `status` enum('draft','ready_to_send','sent','viewed','partially_approved','approved','accepted','declined','expired','converted_to_approved_work','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `reports` MODIFY COLUMN `status` enum('draft','generated','sent','approved','corrections_required','archived') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `reviewType` varchar(50) DEFAULT 'pre_publish' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `status` varchar(50) DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `riskLevel` enum('low','medium','high','critical') DEFAULT 'low';--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `suggestedQaNote` text;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `findingsJson` json;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `suggestedActions` json;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `createdById` int;--> statement-breakpoint
ALTER TABLE `attachments` ADD `locationNote` varchar(255);--> statement-breakpoint
ALTER TABLE `attachments` ADD `isCustomerFacing` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `workOrderId` int;--> statement-breakpoint
ALTER TABLE `devices` ADD `batteryReplaced` varchar(10);--> statement-breakpoint
ALTER TABLE `devices` ADD `maintenanceRequired` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `sortOrder` int;--> statement-breakpoint
ALTER TABLE `devices` ADD `lifecycleStatus` enum('active','needs_service','repair_required','replacement_recommended','replaced','removed');--> statement-breakpoint
ALTER TABLE `devices` ADD `assetCondition` enum('good','fair','poor','failed','unknown');--> statement-breakpoint
ALTER TABLE `devices` ADD `replacementRecommended` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `devices` ADD `replacementRecommendedAt` timestamp;--> statement-breakpoint
ALTER TABLE `devices` ADD `nextServiceDate` date;--> statement-breakpoint
ALTER TABLE `devices` ADD `serviceNotes` text;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `systemType` varchar(50);--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `tagsJson` json;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `visibility` enum('admin_office','technician','ai_only') DEFAULT 'admin_office' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `siteId` int;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `customerOrgId` int;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `sourceType` varchar(50) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `sourceFileId` int;--> statement-breakpoint
ALTER TABLE `knowledge_base` ADD `sourceDocumentId` int;--> statement-breakpoint
ALTER TABLE `quotes` ADD `acceptTokenExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `quoteType` varchar(20) DEFAULT 'deficiency';--> statement-breakpoint
ALTER TABLE `quotes` ADD `discount` decimal(5,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `quotes` ADD `discountReason` varchar(500);--> statement-breakpoint
ALTER TABLE `quotes` ADD `buildingInfo` json;--> statement-breakpoint
ALTER TABLE `quotes` ADD `quoteNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `quotes` ADD `techLabourRate` decimal(8,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `fitterLabourRate` decimal(8,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `fuelCharge` decimal(8,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `backflowReportFee` decimal(8,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `subtotal` decimal(10,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `gst` decimal(10,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `pst` decimal(10,2);--> statement-breakpoint
ALTER TABLE `quotes` ADD `validUntil` date;--> statement-breakpoint
ALTER TABLE `quotes` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `declinedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `viewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `approvedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `quotes` ADD `approvedByEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `quotes` ADD `approvalSource` enum('email','phone','signed_pdf','in_person','portal_later','internal_entry');--> statement-breakpoint
ALTER TABLE `quotes` ADD `createdById` int;--> statement-breakpoint
ALTER TABLE `quotes` ADD `finalizedAt` timestamp;--> statement-breakpoint
ALTER TABLE `reports` ADD `qaNote` text;--> statement-breakpoint
CREATE INDEX `activity_events_companyId_idx` ON `activity_events` (`companyId`);--> statement-breakpoint
CREATE INDEX `activity_events_entity_idx` ON `activity_events` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `activity_events_createdAt_idx` ON `activity_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `agreement_sites_agreementId_idx` ON `agreement_sites` (`agreementId`);--> statement-breakpoint
CREATE INDEX `agreement_sites_companyId_idx` ON `agreement_sites` (`companyId`);--> statement-breakpoint
CREATE INDEX `approved_work_companyId_idx` ON `approved_work` (`companyId`);--> statement-breakpoint
CREATE INDEX `approved_work_siteId_idx` ON `approved_work` (`siteId`);--> statement-breakpoint
CREATE INDEX `approved_work_status_idx` ON `approved_work` (`status`);--> statement-breakpoint
CREATE INDEX `asset_lifecycle_events_deviceId_idx` ON `asset_lifecycle_events` (`deviceId`);--> statement-breakpoint
CREATE INDEX `asset_lifecycle_events_companyId_idx` ON `asset_lifecycle_events` (`companyId`);--> statement-breakpoint
CREATE INDEX `asset_lifecycle_events_siteId_idx` ON `asset_lifecycle_events` (`siteId`);--> statement-breakpoint
CREATE INDEX `cc_companyId_idx` ON `customer_contacts` (`companyId`);--> statement-breakpoint
CREATE INDEX `cc_customerOrgId_idx` ON `customer_contacts` (`customerOrgId`);--> statement-breakpoint
CREATE INDEX `cc_siteId_idx` ON `customer_contacts` (`siteId`);--> statement-breakpoint
CREATE INDEX `cc_role_idx` ON `customer_contacts` (`companyId`,`role`);--> statement-breakpoint
CREATE INDEX `cc_active_idx` ON `customer_contacts` (`companyId`,`isActive`);--> statement-breakpoint
CREATE INDEX `avail_companyId_idx` ON `employee_availability_blocks` (`companyId`);--> statement-breakpoint
CREATE INDEX `avail_userId_idx` ON `employee_availability_blocks` (`userId`);--> statement-breakpoint
CREATE INDEX `avail_startDate_idx` ON `employee_availability_blocks` (`startDate`);--> statement-breakpoint
CREATE INDEX `avail_status_idx` ON `employee_availability_blocks` (`status`);--> statement-breakpoint
CREATE INDEX `fi_companyId_idx` ON `feedback_items` (`companyId`);--> statement-breakpoint
CREATE INDEX `fi_submittedBy_idx` ON `feedback_items` (`submittedById`);--> statement-breakpoint
CREATE INDEX `fi_status_idx` ON `feedback_items` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `ita_templateId_idx` ON `inspection_template_assignments` (`templateId`);--> statement-breakpoint
CREATE INDEX `ita_companyId_idx` ON `inspection_template_assignments` (`companyId`);--> statement-breakpoint
CREATE INDEX `iti_templateId_idx` ON `inspection_template_items` (`templateId`);--> statement-breakpoint
CREATE INDEX `iti_sectionId_idx` ON `inspection_template_items` (`sectionId`);--> statement-breakpoint
CREATE INDEX `iti_companyId_idx` ON `inspection_template_items` (`companyId`);--> statement-breakpoint
CREATE INDEX `itr_jobId_idx` ON `inspection_template_responses` (`jobId`);--> statement-breakpoint
CREATE INDEX `itr_templateId_idx` ON `inspection_template_responses` (`templateId`);--> statement-breakpoint
CREATE INDEX `itr_companyId_idx` ON `inspection_template_responses` (`companyId`);--> statement-breakpoint
CREATE INDEX `its_templateId_idx` ON `inspection_template_sections` (`templateId`);--> statement-breakpoint
CREATE INDEX `its_companyId_idx` ON `inspection_template_sections` (`companyId`);--> statement-breakpoint
CREATE INDEX `it_companyId_idx` ON `inspection_templates` (`companyId`);--> statement-breakpoint
CREATE INDEX `it_company_system_idx` ON `inspection_templates` (`companyId`,`systemType`);--> statement-breakpoint
CREATE INDEX `inventory_items_companyId_idx` ON `inventory_items` (`companyId`);--> statement-breakpoint
CREATE INDEX `inventory_items_category_idx` ON `inventory_items` (`companyId`,`category`);--> statement-breakpoint
CREATE INDEX `inventory_transactions_itemId_idx` ON `inventory_transactions` (`inventoryItemId`);--> statement-breakpoint
CREATE INDEX `inventory_transactions_companyId_idx` ON `inventory_transactions` (`companyId`);--> statement-breakpoint
CREATE INDEX `invoice_line_items_invoiceId_idx` ON `invoice_line_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoices_companyId_idx` ON `invoices` (`companyId`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `invoices_customerOrgId_idx` ON `invoices` (`customerOrgId`);--> statement-breakpoint
CREATE INDEX `notifications_companyId_idx` ON `notifications` (`companyId`);--> statement-breakpoint
CREATE INDEX `notifications_dedupe_idx` ON `notifications` (`companyId`,`dedupeKey`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`companyId`,`isRead`,`isDismissed`);--> statement-breakpoint
CREATE INDEX `parts_catalog_companyId_idx` ON `parts_catalog` (`companyId`);--> statement-breakpoint
CREATE INDEX `parts_request_items_requestId_idx` ON `parts_request_items` (`partsRequestId`);--> statement-breakpoint
CREATE INDEX `parts_request_items_companyId_idx` ON `parts_request_items` (`companyId`);--> statement-breakpoint
CREATE INDEX `parts_requests_companyId_idx` ON `parts_requests` (`companyId`);--> statement-breakpoint
CREATE INDEX `parts_requests_status_idx` ON `parts_requests` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `parts_requests_approvedWorkId_idx` ON `parts_requests` (`approvedWorkId`);--> statement-breakpoint
CREATE INDEX `parts_requests_workOrderId_idx` ON `parts_requests` (`workOrderId`);--> statement-breakpoint
CREATE INDEX `parts_requests_jobId_idx` ON `parts_requests` (`jobId`);--> statement-breakpoint
CREATE INDEX `payroll_te_companyId_idx` ON `payroll_time_entries` (`companyId`);--> statement-breakpoint
CREATE INDEX `payroll_te_userId_idx` ON `payroll_time_entries` (`userId`);--> statement-breakpoint
CREATE INDEX `payroll_te_entryDate_idx` ON `payroll_time_entries` (`entryDate`);--> statement-breakpoint
CREATE INDEX `payroll_te_status_idx` ON `payroll_time_entries` (`status`);--> statement-breakpoint
CREATE INDEX `payroll_te_payPeriod_idx` ON `payroll_time_entries` (`payPeriodStart`,`payPeriodEnd`);--> statement-breakpoint
CREATE INDEX `po_items_purchaseOrderId_idx` ON `purchase_order_items` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `po_items_companyId_idx` ON `purchase_order_items` (`companyId`);--> statement-breakpoint
CREATE INDEX `purchase_orders_companyId_idx` ON `purchase_orders` (`companyId`);--> statement-breakpoint
CREATE INDEX `purchase_orders_status_idx` ON `purchase_orders` (`companyId`,`status`);--> statement-breakpoint
CREATE INDEX `purchase_orders_vendorId_idx` ON `purchase_orders` (`vendorId`);--> statement-breakpoint
CREATE INDEX `purchase_orders_partsRequestId_idx` ON `purchase_orders` (`partsRequestId`);--> statement-breakpoint
CREATE INDEX `repair_quote_items_quoteId_idx` ON `repair_quote_items` (`quoteId`);--> statement-breakpoint
CREATE INDEX `service_agreements_companyId_idx` ON `service_agreements` (`companyId`);--> statement-breakpoint
CREATE INDEX `service_agreements_customerOrgId_idx` ON `service_agreements` (`customerOrgId`);--> statement-breakpoint
CREATE INDEX `service_agreements_status_idx` ON `service_agreements` (`status`);--> statement-breakpoint
CREATE INDEX `setup_progress_companyId_idx` ON `setup_progress` (`companyId`);--> statement-breakpoint
CREATE INDEX `site_work_site_info_companyId_idx` ON `site_work_site_info` (`companyId`);--> statement-breakpoint
CREATE INDEX `time_entries_companyId_idx` ON `time_entries` (`companyId`);--> statement-breakpoint
CREATE INDEX `time_entries_userId_idx` ON `time_entries` (`userId`);--> statement-breakpoint
CREATE INDEX `time_entries_jobId_idx` ON `time_entries` (`jobId`);--> statement-breakpoint
CREATE INDEX `time_entries_entryDate_idx` ON `time_entries` (`entryDate`);--> statement-breakpoint
CREATE INDEX `time_entries_status_idx` ON `time_entries` (`status`);--> statement-breakpoint
CREATE INDEX `vendors_companyId_idx` ON `vendors` (`companyId`);--> statement-breakpoint
CREATE INDEX `work_orders_jobId_idx` ON `work_orders` (`jobId`);--> statement-breakpoint
CREATE INDEX `work_orders_companyId_idx` ON `work_orders` (`companyId`);