-- Add unique constraint on normalized email per company
-- This prevents duplicate users with same email in different cases or with whitespace

-- First, clean up any existing duplicates by keeping only the oldest user per email+company
-- (This is a one-time cleanup before adding the constraint)

CREATE TEMPORARY TABLE user_duplicates AS
SELECT 
  u1.id,
  u1.email,
  u1.companyId,
  LOWER(TRIM(u1.email)) as normalized_email
FROM users u1
WHERE u1.email IS NOT NULL
  AND u1.companyId IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM users u2 
    WHERE u2.id != u1.id 
      AND u2.companyId = u1.companyId
      AND LOWER(TRIM(u2.email)) = LOWER(TRIM(u1.email))
      AND u2.id < u1.id  -- Keep the older user (lower ID)
  );

-- Delete duplicate users (keeping the oldest one per email+company)
DELETE FROM users 
WHERE id IN (SELECT id FROM user_duplicates);

-- Add unique index on normalized email + companyId
-- Using a functional index on LOWER(TRIM(email))
ALTER TABLE users 
ADD UNIQUE INDEX idx_users_normalized_email_company (companyId, (LOWER(TRIM(email))));
