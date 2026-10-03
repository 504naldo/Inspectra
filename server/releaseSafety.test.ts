import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as db from './db';
import { appRouter } from './routers';
import { getCanonicalFireAlarmChecklist } from './canonicalFireAlarmReport';
import { generateComplianceReportPDF } from './pdfGeneratorCompliance';
import { fireAlarmChecklistTemplates, fireAlarmInspectionResults, invoicePayments, invoices, jobs } from '../drizzle/schema';
import type { TrpcContext } from './_core/context';
let office:ReturnType<typeof appRouter.createCaller>, companyId:number, orgId:number, siteId:number;
beforeAll(async()=>{
 companyId=(await db.createCompany({name:'Release safety fixtures'})).id;
 orgId=(await db.createCustomerOrg({companyId,name:'Release safety org'})).id;
 siteId=(await db.createSite({companyId,customerOrgId:orgId,name:'Release safety site'})).id;
 office=appRouter.createCaller({user:{id:991,role:'office',isActive:1,companyId,customerOrgId:null},req:{headers:{}},res:{},requestId:'safety',ipAddress:'127.0.0.1',userAgent:'test'} as unknown as TrpcContext);
});
it('committed partial payment with lost response reconciles, concurrent retries apply once, and a new payment adds exactly once',async()=>{
 const invoice=await office.invoice.create({customerOrgId:orgId,siteId});
 await office.invoice.addLineItem({invoiceId:invoice.id,description:'Work',quantity:1,unitPrice:100,taxable:false});
 const operation={id:invoice.id,requestId:crypto.randomUUID(),amountPaid:40,paidAt:'2026-10-03'};
 const lostResponse=async()=>{await office.invoice.markPaid(operation);throw Error('response connection lost after COMMIT')};
 await expect(lostResponse()).rejects.toThrow(/after COMMIT/);
 expect(await office.invoice.paymentReceipt(operation)).toMatchObject({amountPaid:40,balanceDue:60});
 const replies=await Promise.all(Array.from({length:8},()=>office.invoice.markPaid(operation)));
 expect(replies.every(r=>r.amountPaid===40)).toBe(true);
 await expect(office.invoice.markPaid({...operation,paidAt:'2026-10-04'})).rejects.toMatchObject({code:'CONFLICT'});
 await office.invoice.markPaid({id:invoice.id,requestId:crypto.randomUUID(),amountPaid:60});
 expect(await db.getInvoiceById(invoice.id)).toMatchObject({amountPaid:'100.00',balanceDue:'0.00',status:'paid'});
 const rows=await (await db.getDb())!.select().from(invoicePayments).where(eq(invoicePayments.invoiceId,invoice.id));expect(rows).toHaveLength(2);
 const stranger=appRouter.createCaller({user:{id:992,role:'office',companyId:companyId+10000},req:{headers:{}},res:{},requestId:'foreign'} as unknown as TrpcContext);
 await expect(stranger.invoice.paymentReceipt(operation)).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('legacy overwrite is rejected; receipt update/delete are rejected; forward-compatible retries preserve totals',async()=>{
 const invoice=await office.invoice.create({customerOrgId:orgId,siteId});await office.invoice.addLineItem({invoiceId:invoice.id,description:'Work',quantity:1,unitPrice:100,taxable:false});
 const database=(await db.getDb())!, op={id:invoice.id,requestId:crypto.randomUUID(),amountPaid:30};await office.invoice.markPaid(op);
 await expect(database.update(invoices).set({amountPaid:'20.00'}).where(eq(invoices.id,invoice.id))).rejects.toThrow();
 const [row]=await database.select().from(invoicePayments).where(eq(invoicePayments.invoiceId,invoice.id));
 await expect(database.update(invoices).set({balanceDue:'0.00',status:'paid'}).where(eq(invoices.id,invoice.id))).rejects.toThrow();
 await expect(database.update(invoices).set({paidAt:new Date()}).where(eq(invoices.id,invoice.id))).rejects.toThrow();
 await expect(database.update(invoicePayments).set({amount:'20.00'}).where(eq(invoicePayments.id,row.id))).rejects.toThrow();
 await expect(database.delete(invoicePayments).where(eq(invoicePayments.id,row.id))).rejects.toThrow();
 await office.invoice.markPaid(op);await office.invoice.markPaid({id:invoice.id,requestId:crypto.randomUUID(),amountPaid:20});
 expect(await db.getInvoiceById(invoice.id)).toMatchObject({amountPaid:'50.00',balanceDue:'50.00'});
});
it('a finalized checklist and regenerated PDF preserve changed, added and removed questions, requirements and versions',async()=>{
 const database=(await db.getDb())!;
 const job=await db.createJob({companyId,customerOrgId:orgId,siteId,title:'Historical inspection',jobNumber:crypto.randomUUID(),finalizedAt:new Date()});
 const [question]=await database.insert(fireAlarmChecklistTemplates).values({sectionName:'Original section',sectionOrder:1,itemDescription:'Original question',isRequired:true,requirementType:'test',standardVersion:'2019',effectiveDate:new Date('2019-01-01')}).$returningId();
 const snapshot={captureProvenance:'captured',id:question.id,sectionName:'Original section',sectionOrder:1,itemLetter:'A',itemDescription:'Original question',inputType:'checkbox',requirementType:'test',isRequired:true,standardVersion:'2019'};
 await database.insert(fireAlarmInspectionResults).values({jobId:job.id,fireAlarmSystemId:1,checklistItemId:question.id,result:'fail',notes:'Original answer notes',itemSnapshot:snapshot});
 const before=await getCanonicalFireAlarmChecklist(job.id);
 await database.update(fireAlarmChecklistTemplates).set({itemDescription:'Changed today',standardVersion:'2026',isRequired:false}).where(eq(fireAlarmChecklistTemplates.id,question.id));
 const [added]=await database.insert(fireAlarmChecklistTemplates).values({sectionName:'Added today',sectionOrder:2,itemDescription:'New required question',isRequired:true,effectiveDate:new Date()}).$returningId();
 expect(await getCanonicalFireAlarmChecklist(job.id)).toEqual(before);
 await database.delete(fireAlarmChecklistTemplates).where(eq(fireAlarmChecklistTemplates.id,question.id));
 const after=await getCanonicalFireAlarmChecklist(job.id);expect(after).toEqual(before);
 const data={workOrderNumber:'HISTORY',dateOfService:new Date('2026-01-01'),inspectionFrequency:'Annual',contactPerson:'Fixture',contactPhone:'',buildingName:'Fixture',buildingAddress:'Fixture',city:'Fixture',systemsInspected:{fireAlarmSystem:true,commonAreaDevices:false,inSuiteDevices:false,fireExtinguishers:false,emergencyLighting:false},checklists:after,fireAlarmDevices:[],fireExtinguishers:[],emergencyLights:[],deficiencies:[],systemModel:"Captured",systemOperation:"Single Stage",technicianCertificateNumber:"Fixture",companyName:"Fixture",companyPhone:"",technicianName:'Fixture'};
 const pdf=await generateComplianceReportPDF(data as any);expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(1000);const folder=mkdtempSync(join(tmpdir(),'inspectra-pdf-'));try {const path=join(folder,'history.pdf');writeFileSync(path,pdf);const text=execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});expect(text).toMatch(/Original question/);expect(text).toMatch(/standard 2019/);expect(text).toMatch(/Original answer notes/);expect(text).not.toMatch(/Changed today|New required question|2026; standard/);}finally{rmSync(folder,{recursive:true,force:true});}
 const rows=await database.select().from(fireAlarmInspectionResults).where(eq(fireAlarmInspectionResults.jobId,job.id));expect(rows[0]).toMatchObject({result:'fail',itemSnapshot:snapshot});await database.delete(fireAlarmChecklistTemplates).where(eq(fireAlarmChecklistTemplates.id,added.id));
});
it('unproven legacy snapshots are flagged rather than inferred from current templates',async()=>{
 const database=(await db.getDb())!,job=await db.createJob({companyId,customerOrgId:orgId,siteId,title:'Unproven',jobNumber:crypto.randomUUID(),finalizedAt:new Date()});
 await database.insert(fireAlarmInspectionResults).values({jobId:job.id,fireAlarmSystemId:1,checklistItemId:999999,result:'pass',itemSnapshot:{sectionName:'Legacy',itemDescription:'Backfilled from unknown date',isRequired:true,standardVersion:'2019',requirementType:'test'}});
 await expect(getCanonicalFireAlarmChecklist(job.id)).rejects.toThrow(/cannot be reconstructed/);
});
it('a failure after receipt insertion rolls back receipt and total together; the same operation can then recover',async()=>{
 const invoice=await office.invoice.create({customerOrgId:orgId,siteId});await office.invoice.addLineItem({invoiceId:invoice.id,description:'Work',quantity:1,unitPrice:100,taxable:false});
 const database=(await db.getDb())!,name=`safety_payment_update_${process.pid}`,operation={id:invoice.id,requestId:crypto.randomUUID(),amountPaid:40};
 await database.execute(sql.raw(`CREATE TRIGGER ${name} BEFORE UPDATE ON invoices FOR EACH ROW BEGIN IF NEW.id = ${invoice.id} AND NEW.amountPaid <> OLD.amountPaid THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected update failure after receipt'; END IF; END`));
 try {await expect(office.invoice.markPaid(operation)).rejects.toThrow();expect(await db.getInvoiceById(invoice.id)).toMatchObject({amountPaid:'0.00'});expect(await database.select().from(invoicePayments).where(eq(invoicePayments.invoiceId,invoice.id))).toHaveLength(0);} finally {await database.execute(sql.raw(`DROP TRIGGER ${name}`));}
 expect(await office.invoice.markPaid(operation)).toMatchObject({amountPaid:40,balanceDue:60});
});
