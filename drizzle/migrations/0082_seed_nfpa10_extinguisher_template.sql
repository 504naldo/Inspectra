-- NFPA 10 (2022) Portable Fire Extinguisher — Annual Maintenance Template Seed
-- Migration: 0082_seed_nfpa10_extinguisher_template.sql
-- Derived from server/seeds/nfpa10Extinguisher.ts (14 items across 4 sections).
--
-- Unlike the global CAN/ULC-S536 fire-alarm checklist (its own standard-specific
-- table), NFPA 10 is seeded into the GENERIC per-company template system, which is
-- the standard-agnostic engine behind the template builder, `clone`, and per-job
-- response capture. Because that system is per-company, this migration back-fills
-- ONE copy into every EXISTING company. companyId/templateId/sectionId are always
-- taken from the parent row (never hardcoded), and every INSERT is guarded by
-- NOT EXISTS so the file is safe to re-run.
--
-- NOTE (per-company architecture): companies created AFTER this migration runs do
-- not automatically receive the template. Distributing pre-built standards to new
-- tenants is a follow-up (a nullable-companyId "system/library template" concept,
-- or a new-company provisioning hook). This migration closes the gap for the
-- current tenant base only.

-- ── Step 1: one template per existing company ──────────────────────────────────
INSERT INTO `inspection_templates`
  (`companyId`, `name`, `description`, `systemType`, `inspectionType`, `frequency`, `version`, `status`, `isDefault`, `createdById`)
SELECT
  c.`id`,
  'NFPA 10 — Portable Fire Extinguisher (Annual)',
  'Annual maintenance inspection for portable fire extinguishers per NFPA 10 (2022). Covers placement, physical condition, charge, and service-cadence records (annual / 6-year internal / 12-year hydrostatic).',
  'fire_extinguisher',
  'annual',
  'annual',
  1,
  'active',
  0,
  NULL
FROM `companies` c
WHERE NOT EXISTS (
  SELECT 1 FROM `inspection_templates` t
  WHERE t.`companyId` = c.`id`
    AND t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)'
);

-- ── Step 2: sections (companyId + templateId derived from the template row) ─────
INSERT INTO `inspection_template_sections` (`companyId`, `templateId`, `title`, `sortOrder`, `isRequired`)
SELECT t.`companyId`, t.`id`, 'Location & Accessibility', 0, 1
FROM `inspection_templates` t
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_sections` s WHERE s.`templateId` = t.`id` AND s.`title` = 'Location & Accessibility');

INSERT INTO `inspection_template_sections` (`companyId`, `templateId`, `title`, `sortOrder`, `isRequired`)
SELECT t.`companyId`, t.`id`, 'Physical Condition', 1, 1
FROM `inspection_templates` t
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_sections` s WHERE s.`templateId` = t.`id` AND s.`title` = 'Physical Condition');

INSERT INTO `inspection_template_sections` (`companyId`, `templateId`, `title`, `sortOrder`, `isRequired`)
SELECT t.`companyId`, t.`id`, 'Charge & Pressure', 2, 1
FROM `inspection_templates` t
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_sections` s WHERE s.`templateId` = t.`id` AND s.`title` = 'Charge & Pressure');

INSERT INTO `inspection_template_sections` (`companyId`, `templateId`, `title`, `sortOrder`, `isRequired`)
SELECT t.`companyId`, t.`id`, 'Service Records & Cadence', 3, 1
FROM `inspection_templates` t
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_sections` s WHERE s.`templateId` = t.`id` AND s.`title` = 'Service Records & Cadence');

-- ── Step 3: items (companyId + templateId + sectionId derived from the section) ─
-- Section 1 · Location & Accessibility
INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'A', 'Extinguisher is in its designated place, unobstructed, and visible.', 'pass_fail_na', 1, 0, '{"onValues":["fail"],"severity":"major","defaultTitle":"Extinguisher obstructed or not in designated location"}', 'NFPA 10 §6.1.3'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Location & Accessibility'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'A');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'B', 'Securely mounted on the correct hanger/bracket at the proper installation height.', 'pass_fail_na', 1, 1, '{"onValues":["fail"],"severity":"minor","defaultTitle":"Extinguisher not properly mounted"}', 'NFPA 10 §6.1.3.8'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Location & Accessibility'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'B');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'C', 'Location signage/marking present and visible where the extinguisher is not in plain view.', 'pass_fail_na', 1, 2, '{"onValues":["fail"],"severity":"minor","defaultTitle":"Missing extinguisher location signage"}', 'NFPA 10 §6.1.3.3'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Location & Accessibility'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'C');

-- Section 2 · Physical Condition
INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'A', 'Cylinder free of corrosion, dents, or mechanical damage.', 'pass_fail_na', 1, 0, '{"onValues":["fail"],"severity":"critical","defaultTitle":"Cylinder corroded or damaged"}', 'NFPA 10 §7.2.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Physical Condition'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'A');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'B', 'Hose, nozzle, and horn intact, attached, and free of obstruction.', 'pass_fail_na', 1, 1, '{"onValues":["fail"],"severity":"major","defaultTitle":"Damaged or obstructed hose/nozzle"}', 'NFPA 10 §7.2.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Physical Condition'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'B');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'C', 'Operating-instruction nameplate legible and facing outward.', 'pass_fail_na', 1, 2, '{"onValues":["fail"],"severity":"minor","defaultTitle":"Illegible or misfacing instruction nameplate"}', 'NFPA 10 §6.1.3.6'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Physical Condition'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'C');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'D', 'Tamper seal and safety pin intact.', 'pass_fail_na', 1, 3, '{"onValues":["fail"],"severity":"major","defaultTitle":"Broken tamper seal or missing safety pin"}', 'NFPA 10 §7.2.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Physical Condition'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'D');

-- Section 3 · Charge & Pressure
INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'A', 'Pressure gauge (where provided) reads within the operable (green) range.', 'pass_fail_na', 1, 0, '{"onValues":["fail"],"severity":"critical","defaultTitle":"Extinguisher over- or under-pressurized"}', 'NFPA 10 §7.2.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Charge & Pressure'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'A');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'B', 'Fullness confirmed by weighing or hefting.', 'pass_fail_na', 1, 1, '{"onValues":["fail"],"severity":"critical","defaultTitle":"Extinguisher not full / underweight"}', 'NFPA 10 §7.2.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Charge & Pressure'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'B');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'C', 'CO₂ and cartridge-operated units weighed and within manufacturer tolerance.', 'pass_fail_na', 0, 2, '{"onValues":["fail"],"severity":"major","defaultTitle":"CO₂/cartridge weight out of tolerance"}', 'NFPA 10 §7.3.1'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Charge & Pressure'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'C');

-- Section 4 · Service Records & Cadence
INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'A', 'Annual maintenance tag present, signed, and dated.', 'pass_fail_na', 1, 0, '{"onValues":["fail"],"severity":"major","defaultTitle":"Missing or incomplete annual maintenance tag"}', 'NFPA 10 §7.3.2'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Service Records & Cadence'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'A');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'B', '6-year internal maintenance current for stored-pressure units.', 'pass_fail_na', 1, 1, '{"onValues":["fail"],"severity":"major","defaultTitle":"6-year internal maintenance overdue"}', 'NFPA 10 §7.3.3'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Service Records & Cadence'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'B');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'C', '12-year hydrostatic test current.', 'pass_fail_na', 1, 2, '{"onValues":["fail"],"severity":"critical","defaultTitle":"Hydrostatic test overdue"}', 'NFPA 10 §8.3.1'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Service Records & Cadence'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'C');

INSERT INTO `inspection_template_items` (`companyId`, `templateId`, `sectionId`, `itemCode`, `questionText`, `responseType`, `isRequired`, `sortOrder`, `deficiencyTrigger`, `codeReference`)
SELECT s.`companyId`, s.`templateId`, s.`id`, 'D', 'Correct extinguisher type and rating present for the hazard classification.', 'pass_fail_na', 1, 3, '{"onValues":["fail"],"severity":"major","defaultTitle":"Wrong extinguisher type/rating for hazard"}', 'NFPA 10 §5.2 / §5.5'
FROM `inspection_template_sections` s JOIN `inspection_templates` t ON t.`id` = s.`templateId`
WHERE t.`name` = 'NFPA 10 — Portable Fire Extinguisher (Annual)' AND s.`title` = 'Service Records & Cadence'
  AND NOT EXISTS (SELECT 1 FROM `inspection_template_items` i WHERE i.`sectionId` = s.`id` AND i.`itemCode` = 'D');

-- Verify (per company): 1 template, 4 sections, 14 items
-- SELECT COUNT(*) FROM inspection_template_items i
--   JOIN inspection_templates t ON t.id = i.templateId
--   WHERE t.name = 'NFPA 10 — Portable Fire Extinguisher (Annual)';
