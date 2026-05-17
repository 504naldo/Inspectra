-- Inventory / Parts Ordering v1
-- Run manually on Railway after deploying this migration.
-- PlanetScale-compatible: no FK constraints, separate ALTER TABLE statements.

-- 1. Create inventory_items table
CREATE TABLE inventory_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  partsCatalogId INT NULL,
  sku VARCHAR(100) NULL,
  category VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  unitCost DECIMAL(10,2) DEFAULT 0,
  unitPrice DECIMAL(10,2) DEFAULT 0,
  quantityOnHand INT NOT NULL DEFAULT 0,
  quantityReserved INT NOT NULL DEFAULT 0,
  reorderPoint INT NOT NULL DEFAULT 0,
  reorderQuantity INT NOT NULL DEFAULT 0,
  storageLocation VARCHAR(255) NULL,
  supplierName VARCHAR(255) NULL,
  supplierPartNumber VARCHAR(100) NULL,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX inventory_items_companyId_idx (companyId),
  INDEX inventory_items_category_idx (companyId, category)
);

-- 2. Create parts_requests table
CREATE TABLE parts_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  requestNumber VARCHAR(50) NOT NULL,
  status ENUM('draft','submitted','approved','ordered','partially_received','received','issued','used','cancelled') NOT NULL DEFAULT 'draft',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  requestedById INT NOT NULL,
  assignedToId INT NULL,
  customerOrgId INT NULL,
  siteId INT NULL,
  jobId INT NULL,
  workOrderId INT NULL,
  approvedWorkId INT NULL,
  deficiencyId INT NULL,
  notes TEXT NULL,
  neededByDate DATE NULL,
  submittedAt TIMESTAMP NULL,
  approvedAt TIMESTAMP NULL,
  approvedById INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX parts_requests_companyId_idx (companyId),
  INDEX parts_requests_status_idx (companyId, status),
  INDEX parts_requests_approvedWorkId_idx (approvedWorkId),
  INDEX parts_requests_workOrderId_idx (workOrderId),
  INDEX parts_requests_jobId_idx (jobId)
);

-- 3. Create parts_request_items table
CREATE TABLE parts_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  partsRequestId INT NOT NULL,
  inventoryItemId INT NULL,
  partsCatalogId INT NULL,
  description VARCHAR(500) NOT NULL,
  quantityRequested INT NOT NULL DEFAULT 1,
  quantityApproved INT NOT NULL DEFAULT 0,
  quantityOrdered INT NOT NULL DEFAULT 0,
  quantityReceived INT NOT NULL DEFAULT 0,
  quantityUsed INT NOT NULL DEFAULT 0,
  unitCost DECIMAL(10,2) NULL,
  unitPrice DECIMAL(10,2) NULL,
  status ENUM('requested','approved','ordered','received','issued','used','unavailable','cancelled') NOT NULL DEFAULT 'requested',
  notes TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX parts_request_items_requestId_idx (partsRequestId),
  INDEX parts_request_items_companyId_idx (companyId)
);

-- 4. Create inventory_transactions table
CREATE TABLE inventory_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  inventoryItemId INT NOT NULL,
  transactionType ENUM('initial_count','adjustment','reserved','unreserved','ordered','received','issued','used','returned','removed') NOT NULL,
  quantity INT NOT NULL,
  sourceType VARCHAR(64) NULL,
  sourceId INT NULL,
  notes TEXT NULL,
  performedById INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX inventory_transactions_itemId_idx (inventoryItemId),
  INDEX inventory_transactions_companyId_idx (companyId)
);
