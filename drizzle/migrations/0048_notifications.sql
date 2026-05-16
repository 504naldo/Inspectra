-- Notification Center: in-app operational alerts for admin/office users.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId`     INT NOT NULL,
  `userId`        INT DEFAULT NULL,
  `roleTarget`    VARCHAR(20) DEFAULT NULL,
  `entityType`    VARCHAR(64) DEFAULT NULL,
  `entityId`      INT DEFAULT NULL,
  `type`          VARCHAR(64) NOT NULL,
  `severity`      ENUM('info', 'warning', 'urgent', 'critical') NOT NULL DEFAULT 'info',
  `title`         VARCHAR(255) NOT NULL,
  `message`       TEXT DEFAULT NULL,
  `href`          VARCHAR(500) DEFAULT NULL,
  `isRead`        TINYINT(1) NOT NULL DEFAULT 0,
  `readAt`        TIMESTAMP DEFAULT NULL,
  `isDismissed`   TINYINT(1) NOT NULL DEFAULT 0,
  `dismissedAt`   TIMESTAMP DEFAULT NULL,
  `dedupeKey`     VARCHAR(255) DEFAULT NULL,
  `createdAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt`     TIMESTAMP DEFAULT NULL,
  `metadataJson`  JSON DEFAULT NULL,
  INDEX `notifications_companyId_idx` (`companyId`),
  INDEX `notifications_dedupe_idx` (`companyId`, `dedupeKey`),
  INDEX `notifications_unread_idx` (`companyId`, `isRead`, `isDismissed`)
);
