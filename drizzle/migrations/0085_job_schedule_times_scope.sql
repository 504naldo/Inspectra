-- 0085_job_schedule_times_scope.sql
-- Adds explicit scheduled start/end times and a scope-of-work field to jobs.
-- scheduledDate is unchanged (still the "which day" field); the two new
-- timestamps hold the time window when the office sets one, and scopeOfWork is
-- shown to technicians on their schedule + dashboard. All nullable/additive.
ALTER TABLE `jobs` ADD COLUMN `scheduledStartAt` timestamp NULL;
ALTER TABLE `jobs` ADD COLUMN `scheduledEndAt` timestamp NULL;
ALTER TABLE `jobs` ADD COLUMN `scopeOfWork` text NULL;
