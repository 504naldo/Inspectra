-- Add secondary indexes on hot, frequently-filtered columns that previously had
-- none (only their denormalized `companyId` was indexed). All additive and
-- non-destructive — pure index creation, no data or column changes.
--
--   * inspection_checklist_responses.jobId — responses are loaded per job
--   * job_assignments.userId — "jobs assigned to technician X" filters by userId,
--     which is NOT the leftmost column of the existing unique(jobId,userId) index
--   * attachments.(entityType, entityId) — attachments are fetched per entity
--
-- Mirrors journal migration drizzle/0030_lumpy_stranger.sql (used by CI's
-- drizzle-kit migrate on a fresh DB). Applied to production by the startup
-- migration runner (server/runMigrations.ts), which ignores ER_DUP_KEYNAME, so
-- re-runs are safe. Each statement stands alone (PlanetScale has no
-- multi-statement transactional migrations).

CREATE INDEX `inspection_checklist_responses_jobId_idx` ON `inspection_checklist_responses` (`jobId`);

CREATE INDEX `job_assignments_userId_idx` ON `job_assignments` (`userId`);

CREATE INDEX `attachments_entity_idx` ON `attachments` (`entityType`, `entityId`);
