CREATE TABLE `ai_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobId` int NOT NULL,
  `issues` json NOT NULL,
  `modelUsed` varchar(64) NOT NULL,
  `reviewedAt` timestamp NOT NULL DEFAULT NOW(),
  `overrides` json,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT `ai_reviews_id` PRIMARY KEY (`id`)
);

CREATE INDEX `ai_reviews_jobId_idx` ON `ai_reviews` (`jobId`);
