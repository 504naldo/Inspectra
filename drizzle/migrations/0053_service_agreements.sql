-- Service Agreements v1
-- Run manually on Railway after deploying this migration.
-- PlanetScale-compatible: no FK constraints, CREATE TABLE statements only.

CREATE TABLE service_agreements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  customerOrgId INT NOT NULL,
  agreementNumber VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  status ENUM('draft','active','expiring_soon','expired','cancelled') NOT NULL DEFAULT 'draft',
  startDate DATE,
  endDate DATE,
  renewalDate DATE,
  billingCycle ENUM('monthly','quarterly','semi_annual','annual','per_service','custom') DEFAULT 'annual',
  billingNotes TEXT,
  internalNotes TEXT,
  includedServicesJson JSON,
  excludedServicesJson JSON,
  documentUrl VARCHAR(500),
  createdById INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX service_agreements_companyId_idx (companyId),
  INDEX service_agreements_customerOrgId_idx (customerOrgId),
  INDEX service_agreements_status_idx (status)
);

CREATE TABLE agreement_sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  agreementId INT NOT NULL,
  siteId INT NOT NULL,
  includedServicesJson JSON,
  siteSpecificNotes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY agreement_sites_unique (agreementId, siteId),
  INDEX agreement_sites_agreementId_idx (agreementId),
  INDEX agreement_sites_companyId_idx (companyId)
);
