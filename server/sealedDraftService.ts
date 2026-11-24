import { createHash,randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql, inArray } from "drizzle-orm";
import { mysqlTable,int,varchar,decimal,json,customType,mysqlEnum } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { invoices,quotes,repairQuoteItems,users } from "../drizzle/schema";
import { issueVersions,issueAcceptances,type SealedTerms } from "./issuedQuoteSchema";
import { requireSealedQuoteFixture } from "./issuedQuoteService";
import { exactInvoiceCents,exactInvoiceMoney } from "./confirmedInvoiceTax";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

const hash=(s:Buffer|string)=>createHash("sha256").update(s).digest("hex");
function canonical(v:unknown):string {
 if(v===null||typeof v!=="object") return JSON.stringify(v);
 if(Array.isArray(v)) return "["+v.map(canonical).join(",")+"]";
 return "{"+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,val])=>JSON.stringify(k)+":"+canonical(val)).join(",")+"}";
}
const digest32=customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"binary(32)"});
const money=(name:string)=>decimal(name,{precision:10,scale:2}).notNull();
const draft=mysqlTable("sealed_review_drafts",{
 draftKey:varchar("draft_key",{length:39}).notNull().primaryKey(),
 companyId:int("company_id").notNull(),quoteId:int("quote_id").notNull(),
 customerOrgId:int("customer_org_id").notNull(),siteId:int("site_id").notNull(),
 jobId:int("job_id").notNull(),createdBy:int("created_by").notNull(),
 subtotal:money("subtotal"),gst:money("gst"),pst:money("pst"),total:money("total"),
});
const batch=mysqlTable("sealed_review_draft_batches",{
 draftKey:varchar("draft_key",{length:39}).notNull().primaryKey(),
 companyId:int("company_id").notNull(),quoteId:int("quote_id").notNull(),
 issueId:varchar("issue_id",{length:36}).notNull(),termsDigest:digest32("terms_digest").notNull(),
 lineIdsDigest:digest32("line_ids_digest").notNull(),lineCount:int("line_count").notNull(),
 basis:mysqlEnum("basis",["sealed_whole","sealed_item"]).notNull(),
});
const claim=mysqlTable("sealed_review_draft_lines",{
 quoteItemId:int("quote_item_id").notNull().primaryKey(),quoteId:int("quote_id").notNull(),companyId:int("company_id").notNull(),
 draftKey:varchar("draft_key",{length:39}).notNull(),position:int("position").notNull(),quantity:int("quantity").notNull(),
 description:varchar("description",{length:160}).notNull(),
 subtotal:money("subtotal"),gst:money("gst"),pst:money("pst"),total:money("total"),
});
const proof=mysqlTable("sealed_review_draft_evidence",{
 draftKey:varchar("draft_key",{length:39}).notNull().primaryKey(),
 createdBy:int("created_by").notNull(),data:json("evidence").notNull(),
});
type Tx=Parameters<Parameters<typeof db.withAudit>[2]>[0];
export type SealedDraftInput={quoteId:number;issueId:string;expectedTermsDigest:string;scope:{kind:"whole"}|{kind:"item";quoteItemId:number}};
function denied(message:string):never {throw new TRPCError({code:"PRECONDITION_FAILED",message});}
function collision():never {throw new TRPCError({code:"CONFLICT",message:"That sealed quote item already belongs to a draft."});}
function isDuplicate(error:unknown) {
 for(let i=0;i<4&&error&&typeof error==="object";i++) {
  const v=error as {code?:unknown;cause?:unknown};
  if(v.code==="ER_DUP_ENTRY")return true;
  error=v.cause;
 }
 return false;
}
type Accepted=Awaited<ReturnType<typeof accepted>>;
async function accepted(tx:Tx,q:typeof quotes.$inferSelect,issueId:string) {
 const [v]=await tx.select().from(issueVersions).where(and(eq(issueVersions.companyId,q.companyId),
  eq(issueVersions.customerOrgId,q.customerOrgId),eq(issueVersions.quoteId,q.id),eq(issueVersions.issueId,issueId))).for("share");
 const [a]=await tx.select().from(issueAcceptances).where(eq(issueAcceptances.issueId,issueId)).for("share");
 if(!v||!a||a.companyId!==v.companyId||a.customerOrgId!==v.customerOrgId||a.quoteId!==v.quoteId||
  a.pdfDigest!==v.pdfDigest||a.termsDigest!==v.termsDigest||a.acceptedEpoch<v.issuedEpoch||
  a.acceptedEpoch>=v.expiresEpoch||a.acceptedEpoch>Date.now()||!a.accepterId||a.accepterId===v.issuerId||
  !Buffer.isBuffer(v.pdf)||v.pdf.length<5||v.pdf.length>512*1024||v.pdf.subarray(0,5).toString()!=="%PDF-"||
  hash(v.pdf)!==v.pdfDigest||hash(canonical(v.terms))!==v.termsDigest||!v.terms||
  v.terms.issueId!==v.issueId||v.terms.companyId!==v.companyId||v.terms.customerOrgId!==v.customerOrgId||
  v.terms.quoteId!==v.quoteId||v.terms.siteId!==q.siteId||v.terms.currency!=="CAD"||
  v.terms.issuedEpoch!==v.issuedEpoch||v.terms.expiresEpoch!==v.expiresEpoch)
   denied("The verified sealed acceptance is unavailable for this quote.");
 const lines=v.terms.lines;
 if(!Array.isArray(lines)||lines.length<1||lines.length>25) denied("The sealed line set is incomplete.");
 let earlier=0;
 for(const l of lines) {
  if(!Number.isSafeInteger(l.id)||l.id<=earlier||!Number.isSafeInteger(l.quantity)||l.quantity<1||
    typeof l.description!=="string"||!l.description.trim()||l.description.length>160)
    denied("The sealed line set is incomplete.");
  earlier=l.id;
 }
 const total=totals(lines);
 if(v.terms.subtotal!==total.subtotal||v.terms.gst!==total.gst||v.terms.pst!==total.pst||v.terms.total!==total.total)
   denied("The sealed line totals do not reconcile.");
 return {v,a,lines};
}
function totals(lines:SealedTerms["lines"]) {
 let n=BigInt(0),g=BigInt(0),p=BigInt(0),t=BigInt(0);
 for(const l of lines) {
  const row=[l.subtotal,l.gst,l.pst,l.total].map(exactInvoiceCents);
  const [a,b,c,d]=row;
  if(a==null||b==null||c==null||d==null||d<=BigInt(0)||a+b+c!==d)
   denied("Exact approved CAD amounts are required.");
  n+=a;g+=b;p+=c;t+=d;
 }
 return {subtotal:exactInvoiceMoney(n),gst:exactInvoiceMoney(g),pst:exactInvoiceMoney(p),
  total:exactInvoiceMoney(t),tax:exactInvoiceMoney(g+p)};
}
function idHash(ids:number[]) {return hash(JSON.stringify(ids));}
async function verifyPrior(tx:Tx,q:typeof quotes.$inferSelect,current:Accepted) {
 // Older normal invoices cannot establish exact stable claims. Hold all linked
 // ones, even void, rather than inferring which accepted lines they cover.
 const [legacy]=await tx.select({id:invoices.id}).from(invoices)
  .where(and(eq(invoices.companyId,q.companyId),eq(invoices.quoteId,q.id))).limit(1).for("share");
 if(legacy)denied("Prior quote billing needs reconciliation.");
 const previous=await tx.select({id:draft.draftKey,terms:batch.termsDigest,ids:batch.lineIdsDigest,issueId:batch.issueId,
    count:batch.lineCount,basis:batch.basis}).from(draft)
  .leftJoin(batch,and(eq(batch.draftKey,draft.draftKey),eq(batch.companyId,q.companyId),eq(batch.quoteId,q.id)))
  .where(and(eq(draft.companyId,q.companyId),eq(draft.quoteId,q.id)))
  .orderBy(asc(draft.draftKey)).limit(129).for("share");
 if(previous.length>128) denied("Prior quote billing needs reconciliation.");
 for(const r of previous) {
  if(!r.issueId||!r.count||!r.terms||!r.ids||!r.basis) denied("Prior quote billing needs reconciliation.");
  const prior=r.issueId===current.v.issueId?current:await accepted(tx,q,r.issueId);
  const items=await tx.select({id:claim.quoteItemId}).from(claim).where(and(eq(claim.draftKey,r.id),
     eq(claim.companyId,q.companyId),eq(claim.quoteId,q.id))).orderBy(asc(claim.quoteItemId)).limit(26).for("share");
  const ids=items.map(x=>x.id), allowed=prior.lines.map(x=>x.id);
  if(r.terms.toString("hex")!==prior.v.termsDigest||r.ids.toString("hex")!==idHash(ids)||
    ids.length!==r.count||ids.some(id=>!allowed.includes(id))||
    (r.basis==="sealed_whole" ? ids.length!==allowed.length : ids.length!==1))
     denied("Prior quote billing needs reconciliation.");
 }
}
function allowedActor(ctx:TrpcContext) {
 requireSealedQuoteFixture();
 if(process.env.INSPECTRA_ISOLATED_SEALED_DRAFT!=="1") denied("The private sealed draft fixture is disabled.");
 const actor=ctx.user;
 if(!actor?.companyId||!["office","admin"].includes(actor.role))throw new TRPCError({code:"FORBIDDEN"});
 return {...actor,companyId:actor.companyId};
}
type Actor=ReturnType<typeof allowedActor>;
async function verifyOffice(tx:Tx,actor:Actor) {
 const [fresh]=await tx.select().from(users).where(eq(users.id,actor.id)).for("share");
 if(!fresh||fresh.isActive!==1||fresh.sessionVersion!==actor.sessionVersion||fresh.companyId!==actor.companyId||fresh.role!==actor.role)
    throw new TRPCError({code:"FORBIDDEN"});
}
async function verifyEntitlement(tx:Tx,actor:Actor,customerOrgId:number) {
 const [entitlement]=await tx.execute(sql`SELECT granted_by AS grantedBy FROM issued_quote_draft_authorizers
   WHERE company_id=${actor.companyId} AND customer_org_id=${customerOrgId} AND user_id=${actor.id}
     AND revoked_at IS NULL FOR SHARE`);
 const grants=entitlement as unknown as {grantedBy:number}[];
 if(grants.length!==1||!grants[0].grantedBy||grants[0].grantedBy===actor.id)
   throw new TRPCError({code:"FORBIDDEN"});
}
export async function createSealedFixtureDraft(ctx:TrpcContext,input:SealedDraftInput,companyId:number|null) {
 const actor=allowedActor(ctx);
 if(companyId===null || companyId!==actor.companyId) throw new TRPCError({code:"FORBIDDEN"});
 return db.withAudit(ctx,"isolated.sealedDraft.create",async tx=>{
  await verifyOffice(tx,actor);
  const [q]=await tx.select().from(quotes).where(and(eq(quotes.id,input.quoteId),eq(quotes.companyId,companyId))).for("update");
  if(!q||q.quoteType!=="repair")denied("The verified sealed acceptance is unavailable for this quote.");
  await verifyEntitlement(tx,actor,q.customerOrgId);
  const a=await accepted(tx,q,input.issueId);
  const [latest]=await tx.select({issueId:issueVersions.issueId}).from(issueVersions)
    .where(and(eq(issueVersions.companyId,companyId),eq(issueVersions.quoteId,q.id)))
    .orderBy(desc(issueVersions.seq)).limit(1).for("share");
  if(latest?.issueId!==a.v.issueId||input.expectedTermsDigest!==a.v.termsDigest)
    denied("The sealed acceptance changed; reopen review before drafting.");
  const selection=input.scope.kind==="item"?input.scope.quoteItemId:null;
  const selected=selection===null?a.lines:a.lines.filter(l=>l.id===selection);
  if(!selected.length) denied("The requested stable quote item was not accepted.");
  const ids=selected.map(l=>l.id);
  const canonicalItems=await tx.select({id:repairQuoteItems.id}).from(repairQuoteItems)
   .where(and(eq(repairQuoteItems.quoteId,q.id),inArray(repairQuoteItems.id,ids)))
   .orderBy(asc(repairQuoteItems.id)).for("share");
  if(canonicalItems.length!==ids.length)denied("The accepted stable line identity no longer reconciles.");
  await verifyPrior(tx,q,a);

  // Physical separation: no normal invoice row is written or referenced.
  const m=totals(selected),draftKey="sd_"+randomUUID();
  await tx.insert(draft).values({draftKey,companyId,customerOrgId:q.customerOrgId,
    siteId:q.siteId,jobId:q.jobId,quoteId:q.id,createdBy:actor.id,subtotal:m.subtotal,gst:m.gst,pst:m.pst,total:m.total});
  await tx.insert(batch).values({draftKey,companyId,quoteId:q.id,issueId:a.v.issueId,
   termsDigest:Buffer.from(a.v.termsDigest,"hex"),lineIdsDigest:Buffer.from(idHash(ids),"hex"),lineCount:ids.length,
   basis:selection===null?"sealed_whole":"sealed_item"});
  for(let i=0;i<selected.length;i++) {
   const l=selected[i];
   try {await tx.insert(claim).values({quoteItemId:l.id,quoteId:q.id,companyId,draftKey,position:i,
     quantity:l.quantity,description:l.description,subtotal:l.subtotal,gst:l.gst,pst:l.pst,total:l.total});}
   catch(e) {if(isDuplicate(e))collision();throw e;}
  }
  await tx.insert(proof).values({draftKey,createdBy:actor.id,data:{version:1,kind:input.scope.kind,
      issueId:a.v.issueId,termsDigest:a.v.termsDigest,pdfDigest:a.a.pdfDigest,accepterId:a.a.accepterId,
      acceptedEpoch:a.a.acceptedEpoch,ids,totals:m}});
  return {draftKey,status:"review_only" as const,ids,subtotal:m.subtotal,gst:m.gst,pst:m.pst,total:m.total};
 });
}

export async function readSealedFixtureDraft(ctx:TrpcContext,input:{draftKey:string;expectedTermsDigest:string}) {
 const actor=allowedActor(ctx),companyId=actor.companyId;
 return db.withAudit(ctx,"isolated.sealedDraft.read",async tx=>{
  await verifyOffice(tx,actor);
  // This nonlocking discovery does not authorize anything. Recheck quote scope
  // then invoice under locks, consistent with the drafting writers' lock order.
  const [hint]=await tx.select({quoteId:draft.quoteId}).from(draft)
   .where(and(eq(draft.draftKey,input.draftKey),eq(draft.companyId,companyId))).limit(1);
  if(!hint?.quoteId)denied("This sealed draft is not available.");
  const [q]=await tx.select().from(quotes).where(and(eq(quotes.id,hint.quoteId),eq(quotes.companyId,companyId))).for("share");
  if(!q)denied("This sealed draft is not available.");
  await verifyEntitlement(tx,actor,q.customerOrgId);
  const [i]=await tx.select().from(draft).where(and(eq(draft.draftKey,input.draftKey),
    eq(draft.companyId,companyId),eq(draft.quoteId,q.id))).for("share");
  if(!i||i.customerOrgId!==q.customerOrgId||i.siteId!==q.siteId||i.jobId!==q.jobId)
    denied("This sealed draft is no longer in an exact review state.");
  const [b]=await tx.select().from(batch).where(and(eq(batch.draftKey,i.draftKey),eq(batch.companyId,companyId),
    eq(batch.quoteId,q.id))).for("share");
  if(!b)denied("This sealed draft has no verified claim batch.");
  const a=await accepted(tx,q,b.issueId);
  const [latest]=await tx.select({issueId:issueVersions.issueId}).from(issueVersions)
   .where(and(eq(issueVersions.companyId,companyId),eq(issueVersions.quoteId,q.id)))
   .orderBy(desc(issueVersions.seq)).limit(1).for("share");
  if(latest?.issueId!==a.v.issueId||input.expectedTermsDigest!==a.v.termsDigest||
    b.termsDigest.toString("hex")!==a.v.termsDigest)
     denied("The sealed acceptance changed; reopen review before previewing.");
  const items=await tx.select().from(claim).where(and(
   eq(claim.draftKey,i.draftKey),eq(claim.companyId,companyId),eq(claim.quoteId,q.id)))
   .orderBy(asc(claim.quoteItemId)).limit(26).for("share");
  const ids=items.map(x=>x.quoteItemId);
  const lines=a.lines.filter(x=>ids.includes(x.id));
  if(!ids.length||lines.length!==ids.length||b.lineCount!==ids.length||
    b.lineIdsDigest.toString("hex")!==idHash(ids)||
    (b.basis==="sealed_whole"?ids.length!==a.lines.length:b.basis!=="sealed_item"||ids.length!==1))
     denied("The sealed draft claims no longer reconcile.");
  const m=totals(lines);
  if(i.subtotal!==m.subtotal||i.gst!==m.gst||i.pst!==m.pst||i.total!==m.total)
    denied("The saved draft amounts do not match the sealed acceptance.");
  if(items.some((r,j)=>r.position!==j||r.description!==lines[j].description||
    r.quantity!==lines[j].quantity||r.subtotal!==lines[j].subtotal||r.gst!==lines[j].gst||
    r.pst!==lines[j].pst||r.total!==lines[j].total))
     denied("The saved draft lines do not match the sealed acceptance.");
  const [mark]=await tx.select().from(proof).where(eq(proof.draftKey,i.draftKey)).for("share");
  const evidence={version:1,kind:b.basis==="sealed_whole"?"whole":"item",issueId:a.v.issueId,
    termsDigest:a.v.termsDigest,pdfDigest:a.a.pdfDigest,accepterId:a.a.accepterId,acceptedEpoch:a.a.acceptedEpoch,ids,totals:m};
  if(!mark||mark.createdBy!==i.createdBy||canonical(mark.data)!==canonical(evidence))
     denied("The draft audit receipt does not match its sealed source.");
  return {draftKey:i.draftKey,quoteNumber:a.v.terms.quoteNumber,companyName:a.v.terms.issuerName,
   customerName:a.v.terms.customerName,siteName:a.v.terms.siteName,currency:"CAD" as const,lines,
   subtotal:m.subtotal,gst:m.gst,pst:m.pst,total:m.total,payable:false as const};
 });
}
