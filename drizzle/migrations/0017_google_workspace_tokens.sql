ALTER TABLE users
  ADD COLUMN googleAccessToken TEXT NULL,
  ADD COLUMN googleRefreshToken TEXT NULL,
  ADD COLUMN googleTokenExpiry TIMESTAMP NULL;

ALTER TABLE jobs
  ADD COLUMN googleCalendarEventId VARCHAR(255) NULL;

ALTER TABLE reports
  ADD COLUMN googleDriveUrl TEXT NULL;
