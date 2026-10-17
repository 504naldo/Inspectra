-- Preserve missing historical evidence as NULL; no reconstruction from current templates.
ALTER TABLE `inspection_template_responses` ADD `itemSnapshot` json;
