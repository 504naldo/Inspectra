-- Separately authorized maintenance candidate, not a migration ledger receipt.
-- Under writer fence validate current invoices shape and absent column.
-- Existing legacy tax is unknown; no default, update, or backfill.
ALTER TABLE invoices ADD COLUMN confirmedTax JSON NULL;
