-- Separate, OFF-BY-DEFAULT prospective feature; no live ledger or historic backfill.
CREATE TABLE issued_quote_access (
 companyId INT NOT NULL, customerOrgId INT NOT NULL, userId INT NOT NULL,
 action ENUM('issue','accept') NOT NULL, grantedBy INT NOT NULL,
 grantedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, revokedAt TIMESTAMP NULL DEFAULT NULL,
 PRIMARY KEY (companyId,customerOrgId,userId,action)
) ENGINE=InnoDB;
CREATE TABLE issued_quote_versions (
 seq INT NOT NULL AUTO_INCREMENT PRIMARY KEY, issueId VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 companyId INT NOT NULL, customerOrgId INT NOT NULL, quoteId INT NOT NULL, issuerId INT NOT NULL,
 terms JSON NOT NULL, termsDigest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 pdf MEDIUMBLOB NOT NULL, pdfDigest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 issuedEpoch BIGINT NOT NULL, expiresEpoch BIGINT NOT NULL,
 KEY issued_quote_active (companyId,quoteId,seq)
) ENGINE=InnoDB;
CREATE TABLE issued_quote_acceptances (
 issueId VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 companyId INT NOT NULL, customerOrgId INT NOT NULL, quoteId INT NOT NULL, accepterId INT NOT NULL,
 acceptedEpoch BIGINT NOT NULL, termsDigest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 pdfDigest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 FOREIGN KEY (issueId) REFERENCES issued_quote_versions(issueId)
) ENGINE=InnoDB;
