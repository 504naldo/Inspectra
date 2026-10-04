import { afterAll, beforeAll, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { mkdtemp, readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runMigrations, splitSqlStatements } from './runMigrations';
let admin:mysql.Connection, connection:mysql.Connection, databaseUrl:string, name:string, directory:string;
const journalDir=resolve('drizzle');
async function invariants(){const [rows]=await connection.query("SELECT (SELECT COUNT(*) FROM invoices) invoiceCount,(SELECT SUM(amountPaid) FROM invoices) paidTotal,(SELECT COUNT(*) FROM fire_alarm_inspection_results) captureCount");const [captures]=await connection.query('SELECT jobId, checklistItemId, itemSnapshot, result FROM fire_alarm_inspection_results ORDER BY id');const [ownership]=await connection.query('SELECT id, companyId, customerOrgId FROM invoices ORDER BY id');return {rows,captures,ownership};}
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.startsWith('/inspectra_'))throw Error('Safety tests require explicitly isolated local Inspectra database');
 name=`inspectra_safety_upgrade_${process.pid}`;url.pathname='/';admin=await mysql.createConnection(url.toString());await admin.query(`CREATE DATABASE \`${name}\``);url.pathname='/'+name;databaseUrl=url.toString();connection=await mysql.createConnection(databaseUrl);
 directory=await mkdtemp(join(tmpdir(),'inspectra-migrations-'));const old=join(directory,'journal');await mkdir(join(old,'meta'),{recursive:true});const journal=JSON.parse(await readFile(join(journalDir,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.filter((e:any)=>e.idx<36);await writeFile(join(old,'meta/_journal.json'),JSON.stringify(journal));for(const e of journal.entries)await copyFile(join(journalDir,e.tag+'.sql'),join(old,e.tag+'.sql'));await migrate(drizzle(connection),{migrationsFolder:old});
 await connection.query("INSERT INTO companies(id,name) VALUES(701,'Fixture A'),(702,'Fixture B')");
 await connection.query("INSERT INTO customer_orgs(id,companyId,name) VALUES(701,701,'Org A'),(702,702,'Org B')");
 await connection.query("INSERT INTO sites(id,companyId,customerOrgId,name) VALUES(701,701,701,'Site A')");
 await connection.query("INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title) VALUES(701,701,701,701,'HIST-701','Historical fixture')");
 await connection.query("INSERT INTO invoices(id,companyId,customerOrgId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(701,701,701,'HIST-701','partial',100,30,70),(702,702,702,'HIST-702','partial',200,50,150)");
 await connection.query("INSERT INTO fire_alarm_checklist_templates(id,sectionName,sectionOrder,itemDescription,effectiveDate) VALUES(701,'Today',1,'Edited later','2026-01-01')");
 await connection.query("INSERT INTO fire_alarm_inspection_results(jobId,fireAlarmSystemId,checklistItemId,result,itemSnapshot) VALUES(701,701,701,'pass',NULL),(701,701,702,'fail',JSON_OBJECT('captureProvenance','captured','itemDescription','Original','isRequired',true,'requirementType','test','standardVersion','2019'))");
},30000);
afterAll(async()=>{await connection?.end();if(admin){await admin.query(`DROP DATABASE \`${name}\``);await admin.end()}if(directory)await rm(directory,{recursive:true,force:true})});
it('blocks legacy snapshot fabrication and dependent constraints, preserving nulls, tenant ownership and financial totals',async()=>{
 const dir=join(directory,'unsafe');await mkdir(dir);await copyFile('drizzle/migrations/0011_backfill_item_snapshot.sql',join(dir,'0011_backfill_item_snapshot.sql'));await copyFile('drizzle/migrations/0014_enforce_not_null_item_snapshot.sql',join(dir,'0014_enforce_not_null_item_snapshot.sql'));const before=await invariants();
 // Reproduce the historical backfill hazard inside a rolled-back fixture transaction.
 await connection.beginTransaction();
 for (const statement of splitSqlStatements(await readFile('drizzle/migrations/0011_backfill_item_snapshot.sql','utf8'))) await connection.query(statement);
 const [fabricated]=await connection.query('SELECT itemSnapshot FROM fire_alarm_inspection_results WHERE checklistItemId=701');
 expect((fabricated as any)[0].itemSnapshot.itemDescription).toBe('Edited later');
 await connection.rollback();
 await expect(runMigrations({databaseUrl,migrationsDir:dir,apply:true})).rejects.toThrow(/requires reviewed historical evidence/);expect(await invariants()).toEqual(before);
 const [untrusted]=await connection.query('SELECT itemSnapshot FROM fire_alarm_inspection_results WHERE checklistItemId=701');expect((untrusted as any)[0].itemSnapshot).toBeNull();
});
it('safe additive upgrade resumes after interrupted DDL, repeats without changes, and startup remains read-only',async()=>{
 const dir=join(directory,'safe');await mkdir(dir);for(const f of ['0086_audit_receipts_outbox_calendar.sql','0087_payment_protocol_guard.sql'])await copyFile('drizzle/migrations/'+f,join(dir,f));const before=await invariants();
 // Simulate crash after the first committed DDL statement and first trigger.
 const first=splitSqlStatements(await readFile(join(dir,'0086_audit_receipts_outbox_calendar.sql'),'utf8'))[0];await connection.query(first);
 await expect(runMigrations({databaseUrl,migrationsDir:dir})).rejects.toThrow(/Explicit maintenance/);
 await runMigrations({databaseUrl,migrationsDir:dir,apply:true});expect(await invariants()).toEqual(before);
 await runMigrations({databaseUrl,migrationsDir:dir,apply:true});await runMigrations({databaseUrl,migrationsDir:dir});expect(await invariants()).toEqual(before);
 const [triggers]=await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'inspectra_%'");expect(triggers).toHaveLength(4);
 await expect(connection.query('UPDATE invoices SET amountPaid=10 WHERE id=701')).rejects.toThrow(/protocol v2/);
});
it('failure stops later migrations and explicit corrected retry recovers without dropping receipts or changing historical facts',async()=>{
 const dir=join(directory,'interrupt');await mkdir(dir);await writeFile(join(dir,'0088_interrupted.sql'),'CREATE TABLE safety_partial (id INT); SELECT * FROM nonexistent_safety_table;');await writeFile(join(dir,'0089_after.sql'),'CREATE TABLE safety_after (id INT);');const before=await invariants();
 await expect(runMigrations({databaseUrl,migrationsDir:dir,apply:true})).rejects.toThrow();const [later]=await connection.query("SHOW TABLES LIKE 'safety_after'");expect(later).toHaveLength(0);
 await writeFile(join(dir,'0088_interrupted.sql'),'CREATE TABLE safety_partial (id INT); SELECT 1;');await runMigrations({databaseUrl,migrationsDir:dir,apply:true});expect(await invariants()).toEqual(before);
});
