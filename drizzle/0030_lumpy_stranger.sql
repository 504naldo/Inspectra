CREATE INDEX `attachments_entity_idx` ON `attachments` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `inspection_checklist_responses_jobId_idx` ON `inspection_checklist_responses` (`jobId`);--> statement-breakpoint
CREATE INDEX `job_assignments_userId_idx` ON `job_assignments` (`userId`);