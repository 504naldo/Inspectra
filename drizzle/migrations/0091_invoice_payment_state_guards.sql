-- Explicit production migration after backup/schema review; no historical payment reconstruction.
-- Additive protection for unpaid invoices and paid/void transitions. No data rewrite.
DELIMITER $$
CREATE TRIGGER inspectra_invoice_unpaid_insert_v3 BEFORE INSERT ON invoices FOR EACH ROW
BEGIN
 IF NEW.status IN ('paid', 'partial') OR COALESCE(NEW.amountPaid, 0) <> 0 OR NEW.paidAt IS NOT NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New invoices must be unpaid; record payments using durable receipts';
 END IF;
END$$

CREATE TRIGGER inspectra_invoice_payment_state_v3 BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
 DECLARE expected_paid DECIMAL(12,2) DEFAULT NULL;
 DECLARE receipt_count BIGINT DEFAULT 0;
 SELECT COUNT(*) INTO receipt_count FROM invoice_payments WHERE invoiceId = OLD.id;
 IF NEW.status = 'void' AND (receipt_count > 0 OR COALESCE(OLD.amountPaid, 0) > 0 OR COALESCE(NEW.amountPaid, 0) > 0) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An invoice with payments requires a reviewed refund or credit workflow';
 END IF;
 IF (receipt_count > 0 OR OLD.status IN ('paid', 'partial') OR COALESCE(OLD.amountPaid, 0) > 0) AND NEW.status NOT IN ('paid', 'partial') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Received payments cannot be downgraded to an unpaid invoice state';
 END IF;
 IF receipt_count > 0 OR (NEW.status <> OLD.status AND NEW.status IN ('paid', 'partial')) OR NOT (NEW.paidAt <=> OLD.paidAt) THEN
  SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(result, '$.amountPaid')) AS DECIMAL(12,2)) INTO expected_paid
    FROM invoice_payments WHERE invoiceId = OLD.id ORDER BY id DESC LIMIT 1;
  IF expected_paid IS NULL OR expected_paid <= 0 OR NOT (NEW.amountPaid <=> expected_paid) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment status and date require a durable payment receipt';
  END IF;
  IF NEW.status = 'paid' AND (expected_paid < NEW.total OR NEW.balanceDue <> 0) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Paid status requires a fully received payment';
  END IF;
  IF NEW.status = 'partial' AND (expected_paid >= NEW.total OR NEW.balanceDue <= 0) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Partial status requires an outstanding balance';
  END IF;
 END IF;
END$$
DELIMITER ;
