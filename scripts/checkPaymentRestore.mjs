// Synthetic full MySQL backup/restore + post-backup receipt recovery.
// Requires the explicitly local Docker MySQL service, never production.
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { assertCurrentPaymentSchema, disposableDatabaseUrl } from './lib/paymentAcceptance.mjs';
const url=disposableDatabaseUrl();
const container=process.env.DISPOSABLE_MYSQL_CONTAINER;
if(!container||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container))throw Error('DISPOSABLE_MYSQL_CONTAINER must identify the disposable local MySQL 8 container');
const suffix=`${process.pid}_${randomUUID().slice(0,8)}`;
const sourceName=`inspectra_restore_source_${suffix}`, restoredName=`inspectra_restore_target_${suffix}`;
const ownedDatabases=new Set();
url.pathname='/';const admin=await mysql.createConnection(url.toString());
const folder=await mkdtemp(join(tmpdir(),'inspectra-backup-')),dump=join(folder,'synthetic.sql');let source,restored;
const dockerArgs=['--host=unix:///var/run/docker.sock','exec'];
const localEnv={...process.env,MYSQL_PWD:decodeURIComponent(url.password)};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete localEnv[key];
async function command(args,input,output){
 const child=spawn('docker',[...dockerArgs,...(input?['-i']:[]),'--env','MYSQL_PWD',container,...args],{env:localEnv,stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000)});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(`Local backup command failed (${code}): ${stderr}`)))});
 const inputDone=input?pipeline(createReadStream(input),child.stdin):Promise.resolve(child.stdin.end());
 const outputDone=output?pipeline(child.stdout,createWriteStream(output)):Promise.resolve(child.stdout.resume());
 // Never clean up the database while a failed dump/import still has streams running.
 const results=await Promise.allSettled([done,inputDone,outputDone]);
 const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
}
async function state(c){
 const tables=['companies','customer_orgs','sites','jobs','devices','invoices','invoice_line_items','invoice_payments','fire_alarm_inspection_results','inspection_results','deficiencies','inspection_templates','inspection_template_sections','inspection_template_items','inspection_template_responses'];
 const data={};for(const table of tables){data[table]=(await c.query(`SELECT * FROM \`${table}\` ORDER BY id`))[0]}
 const [triggers]=await c.query("SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'inspectra_%' ORDER BY TRIGGER_NAME");
 return {data,invoices:data.invoices,receipts:data.invoice_payments,triggers};
}
async function prepareHistoricalSchema(){
 // Historical nonzero balances must be seeded before the new unpaid-insert floor.
 const prefix=join(folder,'journal-0037');await mkdir(join(prefix,'meta'),{recursive:true});
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 journal.entries=journal.entries.filter(entry=>entry.idx<=37);assert.equal(journal.entries.at(-1).idx,37);
 await writeFile(join(prefix,'meta/_journal.json'),JSON.stringify(journal));
 for(const entry of journal.entries)await copyFile(join('drizzle',entry.tag+'.sql'),join(prefix,entry.tag+'.sql'));
 await migrate(drizzle(source),{migrationsFolder:prefix});
}

async function payment(c,requestId,amount,totalPaid){await c.beginTransaction();try{await c.query('SET @inspectra_payment_protocol=2');await c.query('SELECT id FROM invoices WHERE id=1 FOR UPDATE');await c.query('INSERT INTO invoice_payments(invoiceId,requestId,amount,result,recordedById) VALUES(1,?,?,?,1)',[requestId,amount,JSON.stringify({success:true,total:100,amountPaid:totalPaid,balanceDue:100-totalPaid,status:'partial',operationPaidAt:null})]);await c.query('UPDATE invoices SET amountPaid=?,balanceDue=?,status=\'partial\' WHERE id=1',[totalPaid,100-totalPaid]);await c.commit()}catch(e){await c.rollback();throw e}finally{await c.query('SET @inspectra_payment_protocol=NULL')}}
try{
 await admin.query(`CREATE DATABASE \`${sourceName}\``);ownedDatabases.add(sourceName);url.pathname='/'+sourceName;source=await mysql.createConnection(url.toString());await prepareHistoricalSchema();
 await source.query("INSERT INTO companies(id,name) VALUES(1,'Restore A'),(2,'Restore B')");await source.query("INSERT INTO customer_orgs(id,companyId,name) VALUES(1,1,'Org A'),(2,2,'Org B')");await source.query("INSERT INTO sites(id,companyId,customerOrgId,name) VALUES(1,1,1,'Site A')");await source.query("INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title,finalizedAt,tech_signature_url,contact_signature_url) VALUES(1,1,1,1,'RESTORE-1','Original inspection','2026-01-01','https://legacy.example.invalid/tech.png','https://legacy.example.invalid/contact.png')");
 await source.query("INSERT INTO invoices(id,companyId,customerOrgId,invoiceNumber,subtotal,total,amountPaid,balanceDue,status) VALUES(1,1,1,'RESTORE-1',100,100,20,80,'partial'),(2,2,2,'RESTORE-2',200,200,50,150,'partial')");await source.query("INSERT INTO invoice_line_items(invoiceId,description,quantity,unitPrice,total,taxable) VALUES(1,'Work',1,100,100,false)");
 await source.query("INSERT INTO fire_alarm_inspection_results(jobId,fireAlarmSystemId,checklistItemId,result,notes,itemSnapshot) VALUES(1,1,1,'fail','Original answer',JSON_OBJECT('captureProvenance','captured','sectionName','Original','sectionOrder',1,'itemDescription','Original question','requirementType','test','isRequired',true,'standardVersion','2019'))");
 await source.query("INSERT INTO devices(id,siteId,companyId,category,deviceType,location) VALUES(1,1,1,'FIRE_EXTINGUISHER','Extinguisher','Original hall')");
 await source.query("INSERT INTO inspection_results(id,jobId,deviceId,companyId,result,notes) VALUES(1,1,1,1,'fail','Legacy observation')");
 await source.query("INSERT INTO deficiencies(id,jobId,deviceId,inspectionResultId,reportedById,title) VALUES(1,1,1,1,1,'Legacy issue')");
 await source.query("INSERT INTO inspection_templates(id,companyId,name) VALUES(1,1,'Original template')");
 await source.query("INSERT INTO inspection_template_sections(id,companyId,templateId,title) VALUES(1,1,1,'Original section')");
 await source.query("INSERT INTO inspection_template_items(id,companyId,templateId,sectionId,questionText) VALUES(1,1,1,1,'Original question'),(2,1,1,1,'Captured question')");
 await source.query("INSERT INTO inspection_template_responses(id,companyId,jobId,templateId,sectionId,itemId,responseValue) VALUES(1,1,1,1,1,1,'fail')");
 const historical=(await source.query('SELECT * FROM invoices ORDER BY id'))[0];
 await migrate(drizzle(source),{migrationsFolder:'drizzle'});await assertCurrentPaymentSchema(source);
 assert.deepEqual((await source.query('SELECT * FROM invoices ORDER BY id'))[0],historical);
 for(const [table,column] of [['inspection_results','deviceSnapshot'],['deficiencies','deviceSnapshot'],['inspection_template_responses','itemSnapshot']])assert.equal((await source.query(`SELECT \`${column}\` value FROM \`${table}\` WHERE id=1`))[0][0].value,null);
 assert.equal((await source.query('SELECT finalizationHashVersion version FROM jobs WHERE id=1'))[0][0].version,1);
 const [legacySignature]=await source.query('SELECT tech_signature_key,contact_signature_key,tech_signature_url,contact_signature_url FROM jobs WHERE id=1');
 assert.deepEqual(legacySignature[0],{tech_signature_key:null,contact_signature_key:null,tech_signature_url:'https://legacy.example.invalid/tech.png',contact_signature_url:'https://legacy.example.invalid/contact.png'});
 console.log('PASS: journal 0038–0042 preserves historical financial baselines/owners, legacy signature URLs/NULL keys and evidence, and v1 seals');
 await source.query("INSERT INTO jobs(id,companyId,customerOrgId,siteId,jobNumber,title) VALUES(2,1,1,1,'RESTORE-NEW','Current capture')");
 await source.query("UPDATE jobs SET tech_signature_key='signatures/restore-tech.png',contact_signature_key='signatures/restore-contact.png',tech_signature_url='https://storage.example.invalid/expired-tech.png',contact_signature_url='https://storage.example.invalid/expired-contact.png' WHERE id=2");
 const snapshot={captureProvenance:'captured',capturedAt:'2026-01-02T12:00:00.000Z',capturedById:1,jobId:2,companyId:1,siteId:1,deviceId:1,category:'FIRE_EXTINGUISHER',deviceType:'Extinguisher',location:'Original hall',isActive:true};
 for(const key of ['serialNumber','manufacturer','model','label','floor','suiteNumber','barcode','installDate','circuitAddress','zone','notes','powerType','mfgDate','lastHST','last6yr','ladderHeight','supplyVoltage','modelWattage','batteryYear','batterySize','batteryCount','batteryReplaced','maintenanceRequired','lampCount'])snapshot[key]=null;
 await source.query("INSERT INTO inspection_results(id,jobId,deviceId,companyId,result,deviceSnapshot) VALUES(2,2,1,1,'fail',?)",[JSON.stringify(snapshot)]);
 await source.query("INSERT INTO deficiencies(id,jobId,deviceId,inspectionResultId,reportedById,title,deviceSnapshot) VALUES(2,2,1,2,1,'Captured issue',?)",[JSON.stringify(snapshot)]);
 await source.query("INSERT INTO inspection_template_responses(id,companyId,jobId,templateId,sectionId,itemId,responseValue,itemSnapshot) VALUES(2,1,2,1,1,2,'pass',?)",[JSON.stringify({captureProvenance:'captured',capturedAt:'2026-01-02T12:00:00.000Z',capturedById:1,companyId:1,jobId:2,template:{id:1,name:'Original template',systemType:'general',inspectionType:'annual',version:1},section:{id:1,title:'Original section',sortOrder:0,description:null},item:{id:2,code:null,wording:'Captured question',responseType:'pass_fail_na',isRequired:true,sortOrder:0,codeReference:null,helpText:null,options:null,deficiencyTrigger:null}})]);
 const first=randomUUID();await payment(source,first,30,50);const backupState=await state(source);
 await command(['mysqldump',`--user=${decodeURIComponent(url.username)}`,'--single-transaction','--routines','--triggers','--no-tablespaces','--set-gtid-purged=OFF',sourceName],null,dump);
 const postBackup=randomUUID();await payment(source,postBackup,25,75);const latest=await state(source);
 await admin.query(`CREATE DATABASE \`${restoredName}\``);ownedDatabases.add(restoredName);await command(['mysql',`--user=${decodeURIComponent(url.username)}`,restoredName],dump);url.pathname='/'+restoredName;restored=await mysql.createConnection(url.toString());await assertCurrentPaymentSchema(restored);assert.deepEqual(await state(restored),backupState);console.log('PASS: full mysqldump restores all rows, totals, tenant ownership, legacy/current device/template evidence, receipt history and all six guard definitions');
 assert.notDeepEqual((await state(restored)).invoices,latest.invoices);console.log('PASS: a pre-payment backup is explicitly detected as stale after a new cumulative receipt; blind old-version rollback would lose $25');
 await assert.rejects(restored.query('UPDATE invoices SET amountPaid=25,balanceDue=75 WHERE id=1'));await assert.rejects(restored.query('DELETE FROM invoice_payments WHERE invoiceId=1'));for(const status of ['draft','sent','approved','overdue','void','paid'])await assert.rejects(restored.query('UPDATE invoices SET status=? WHERE id=1',[status]));
 await assert.rejects(restored.query("INSERT INTO invoices(companyId,invoiceNumber,status,total,amountPaid,balanceDue) VALUES(1,'UNSAFE-INSERT','partial',100,0,100)"));
 await restored.query('SET @inspectra_payment_protocol=2');try{await assert.rejects(restored.query("UPDATE invoices SET status='paid' WHERE id=1"));}finally{await restored.query('SET @inspectra_payment_protocol=NULL');}
 await assert.rejects(restored.query('UPDATE invoices SET paidAt=NOW() WHERE id=2'));console.log('PASS: restored guards reject old writers, receipt deletion, state downgrades, incorrect classification and unreceipted payments');
 const exported=latest.receipts.find(row=>row.requestId===postBackup);assert(exported);
 async function reconcile(){await restored.beginTransaction();try{await restored.query('SET @inspectra_payment_protocol=2');const [locked]=await restored.query('SELECT companyId,customerOrgId FROM invoices WHERE id=1 FOR UPDATE');assert.equal(locked[0].companyId,latest.invoices[0].companyId);assert.equal(locked[0].customerOrgId,latest.invoices[0].customerOrgId);const [existing]=await restored.query('SELECT result FROM invoice_payments WHERE invoiceId=1 AND requestId=?',[postBackup]);if(existing.length)assert.deepEqual(existing[0].result,exported.result);else{await restored.query('INSERT INTO invoice_payments(id,invoiceId,requestId,amount,result,recordedById,recordedAt) VALUES(?,?,?,?,?,?,?)',[exported.id,exported.invoiceId,exported.requestId,exported.amount,JSON.stringify(exported.result),exported.recordedById,exported.recordedAt]);await restored.query('UPDATE invoices SET amountPaid=?,balanceDue=?,status=?,updatedAt=? WHERE id=1',[exported.result.amountPaid,exported.result.balanceDue,exported.result.status,latest.invoices[0].updatedAt]);}await restored.commit()}catch(e){await restored.rollback();throw e}finally{await restored.query('SET @inspectra_payment_protocol=NULL')}}
 await reconcile();await reconcile();assert.deepEqual(await state(restored),latest);console.log('PASS: reviewed synthetic post-backup receipt forward recovery restores $75 total exactly once, preserving historical baseline, tenants and snapshots');
 console.log('PASS: isolated backup/restore rehearsal only; sanitized production data, PITR and real accounting-source reconciliation remain unrun');
}finally{await source?.end();await restored?.end();for(const name of ownedDatabases)await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);await admin.end();await rm(folder,{recursive:true,force:true})}
