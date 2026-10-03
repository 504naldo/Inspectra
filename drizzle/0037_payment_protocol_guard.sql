-- Explicit payment protocol floor. No data backfill.
CREATE TRIGGER inspectra_payment_insert_v2 BEFORE INSERT ON invoice_payments FOR EACH ROW
BEGIN
 IF COALESCE(@inspectra_payment_protocol, 0) <> 2 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment protocol v2 required; older payment writers are unsafe';
 END IF;
END;
--> statement-breakpoint
CREATE TRIGGER inspectra_payment_no_update BEFORE UPDATE ON invoice_payments FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment receipts are immutable';
END;
--> statement-breakpoint
CREATE TRIGGER inspectra_payment_no_delete BEFORE DELETE ON invoice_payments FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment receipts are immutable';
END;
--> statement-breakpoint
CREATE TRIGGER inspectra_invoice_payment_v2 BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
 DECLARE expected_paid DECIMAL(12,2);
 SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(result, '$.amountPaid')) AS DECIMAL(12,2)) INTO expected_paid
   FROM invoice_payments WHERE invoiceId = OLD.id ORDER BY id DESC LIMIT 1;
 IF NOT (NEW.amountPaid <=> OLD.amountPaid) AND COALESCE(@inspectra_payment_protocol, 0) <> 2 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment protocol v2 required; freeze old payment writers';
 END IF;
 IF NOT (NEW.amountPaid <=> OLD.amountPaid) AND expected_paid IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment total must match durable receipt';
 END IF;
 IF expected_paid IS NOT NULL THEN
  IF NOT (NEW.amountPaid <=> expected_paid) OR NOT (NEW.balanceDue <=> GREATEST(0, NEW.total - expected_paid)) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment state must match durable receipts and authoritative total';
  END IF;
  IF NOT (NEW.paidAt <=> OLD.paidAt) AND COALESCE(@inspectra_payment_protocol, 0) <> 2 THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment date requires protocol v2';
  END IF;
  IF NEW.status <> OLD.status AND NEW.status IN ('paid','partial') AND COALESCE(@inspectra_payment_protocol, 0) <> 2 THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment status requires protocol v2';
  END IF;
 END IF;
END;
