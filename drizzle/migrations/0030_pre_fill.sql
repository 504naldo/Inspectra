-- Migration 0030: Inspection pre-fill from prior job
-- 1. Add copiedFromJobId to jobs for audit traceability
ALTER TABLE `jobs` ADD COLUMN `copied_from_job_id` int;

-- 2. Add carriedForward flag to inspection_results
ALTER TABLE `inspection_results`
  ADD COLUMN `carried_forward` tinyint(1) NOT NULL DEFAULT 0;

-- 3. Make technicianId nullable (pre-filled rows have no technician yet)
ALTER TABLE `inspection_results`
  MODIFY COLUMN `technicianId` int;
