-- Synthetic prototype. Does not alter, write or reference normal invoices/lines.
CREATE TABLE sealed_review_drafts (
 draft_key VARCHAR(39) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 company_id INT NOT NULL, customer_org_id INT NOT NULL, quote_id INT NOT NULL,
 site_id INT NOT NULL, job_id INT NOT NULL, created_by INT NOT NULL,
 subtotal DECIMAL(10,2) NOT NULL, gst DECIMAL(10,2) NOT NULL,
 pst DECIMAL(10,2) NOT NULL, total DECIMAL(10,2) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_review_draft_scope(draft_key,company_id,quote_id),
 KEY ix_review_quote_tenant(company_id,quote_id),
 CHECK (subtotal>=0 AND gst>=0 AND pst>=0 AND total>0 AND subtotal+gst+pst=total)
) ENGINE=InnoDB;
CREATE TABLE sealed_review_draft_batches (
 draft_key VARCHAR(39) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 company_id INT NOT NULL, quote_id INT NOT NULL,
 issue_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 terms_digest BINARY(32) NOT NULL, line_ids_digest BINARY(32) NOT NULL, line_count INT NOT NULL,
 basis ENUM('sealed_whole','sealed_item') NOT NULL,
 UNIQUE KEY uq_review_batch_scope(draft_key,company_id,quote_id),
 CHECK (line_count BETWEEN 1 AND 25 AND (basis<>'sealed_item' OR line_count=1)),
 FOREIGN KEY (draft_key,company_id,quote_id) REFERENCES sealed_review_drafts(draft_key,company_id,quote_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE sealed_review_draft_lines (
 quote_item_id INT NOT NULL PRIMARY KEY,
 draft_key VARCHAR(39) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 company_id INT NOT NULL, quote_id INT NOT NULL,
 position INT NOT NULL, quantity INT NOT NULL, description VARCHAR(160) NOT NULL,
 subtotal DECIMAL(10,2) NOT NULL, gst DECIMAL(10,2) NOT NULL, pst DECIMAL(10,2) NOT NULL,total DECIMAL(10,2) NOT NULL,
 UNIQUE KEY uq_review_line_order (draft_key,position),
 KEY ix_review_line_scope(draft_key,company_id,quote_id),
 CHECK (position BETWEEN 0 AND 24 AND quantity>0),
 CHECK (subtotal>=0 AND gst>=0 AND pst>=0 AND total>0 AND subtotal+gst+pst=total),
 FOREIGN KEY (draft_key,company_id,quote_id) REFERENCES sealed_review_draft_batches(draft_key,company_id,quote_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE sealed_review_draft_evidence (
 draft_key VARCHAR(39) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 created_by INT NOT NULL, evidence JSON NOT NULL,
 FOREIGN KEY (draft_key) REFERENCES sealed_review_drafts(draft_key) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE issued_quote_draft_authorizers (
 company_id INT NOT NULL, customer_org_id INT NOT NULL, user_id INT NOT NULL,
 granted_by INT NOT NULL, revoked_at TIMESTAMP NULL DEFAULT NULL,
 PRIMARY KEY(company_id,customer_org_id,user_id)
) ENGINE=InnoDB;
