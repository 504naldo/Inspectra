-- Private reference. Install in exact app schema, by separately authorized
-- maintenance principal. This statement's definer must equal the four guards'.
-- Runtime gets only EXECUTE on this routine in addition to normal app DML.
DELIMITER $$
CREATE PROCEDURE inspectra_attest_payment_guards_v1()
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
 SELECT TRIGGER_NAME AS trigger_name, EVENT_OBJECT_TABLE AS object_table,
   EVENT_MANIPULATION AS event_type, ACTION_TIMING AS action_timing,
   ACTION_ORDER AS action_order, LOWER(SHA2(TRIM(ACTION_STATEMENT),256)) AS body_hash,
   DEFINER AS guard_definer, CURRENT_USER() AS attestor_definer,
   SQL_MODE AS creation_mode, CHARACTER_SET_CLIENT AS client_charset,
   COLLATION_CONNECTION AS connection_collation, DATABASE_COLLATION AS database_collation
 FROM INFORMATION_SCHEMA.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE()
   AND (EVENT_OBJECT_TABLE IN ('invoices','invoice_payments')
   OR TRIGGER_NAME IN ('inspectra_payment_insert_v2','inspectra_payment_no_update',
      'inspectra_payment_no_delete','inspectra_invoice_payment_v2'));
END$$
DELIMITER ;
