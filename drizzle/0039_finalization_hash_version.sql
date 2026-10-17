-- Historical seals retain version 1. Only new seals explicitly write version 2.
ALTER TABLE `jobs` ADD `finalizationHashVersion` int DEFAULT 1 NOT NULL;
