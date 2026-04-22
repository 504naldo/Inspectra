-- Migration 0032: Add service-list import fields to monthly_service_tracking
-- Run on Railway after 0031.
ALTER TABLE `monthly_service_tracking`
  ADD COLUMN `hoursRequired`  decimal(5,2),
  ADD COLUMN `techsRequired`  int,
  ADD COLUMN `stampsRequired` varchar(100),
  ADD COLUMN `hasContractor`  boolean,
  ADD COLUMN `hasKeys`        boolean,
  ADD COLUMN `lastCompleted`  varchar(50),
  ADD COLUMN `agreementSigned` boolean;
