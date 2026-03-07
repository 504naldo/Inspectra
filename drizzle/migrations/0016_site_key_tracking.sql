-- Migration: Add key tracking fields to sites table
-- These fields mirror the AppSheet portal's KeyLocation, KeyNumber, KeySignOutDate columns

ALTER TABLE sites ADD COLUMN keyLocation TEXT;
ALTER TABLE sites ADD COLUMN keyNumber VARCHAR(50);
ALTER TABLE sites ADD COLUMN keySignOutDate TIMESTAMP NULL;
ALTER TABLE sites ADD COLUMN keySignedOutBy VARCHAR(100);
