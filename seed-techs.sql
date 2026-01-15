-- Upsert technician users
INSERT INTO users (email, displayName, role, isActive, companyId, createdAt, updatedAt)
VALUES 
  ('chris@ewandf.ca', 'Chris Young', 'TECH', true, 1, NOW(), NOW()),
  ('pat@ewandf.ca', 'Pat McKinney', 'TECH', true, 1, NOW(), NOW()),
  ('russ@ewandf.ca', 'Russ', 'TECH', true, 1, NOW(), NOW()),
  ('markus@ewandf.ca', 'Markus', 'TECH', true, 1, NOW(), NOW()),
  ('tony@ewandf.ca', 'Tony', 'TECH', true, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  displayName = VALUES(displayName),
  role = 'TECH',
  isActive = true,
  updatedAt = NOW();
