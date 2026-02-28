-- Rollback: 0008_add_ai_provenance_columns
-- Reverses: aiGeneratedAt, aiModelId, aiPromptHash, aiContext added to deficiencies.

ALTER TABLE `deficiencies`
  DROP COLUMN IF EXISTS `aiContext`,
  DROP COLUMN IF EXISTS `aiPromptHash`,
  DROP COLUMN IF EXISTS `aiModelId`,
  DROP COLUMN IF EXISTS `aiGeneratedAt`;
