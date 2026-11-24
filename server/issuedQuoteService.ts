import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import PDFDocument from "pdfkit";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { companies, customerOrgs, quotes, repairQuoteItems, sites, users } from "../drizzle/schema";
import { issueVersions, issueAcceptances, quoteAccess, type SealedTerms } from "./issuedQuoteSchema";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

function fail(message:string):never { throw new TRPCError({code:"PRECONDITION_FAILED",message}); }
export function sealedQuoteRehearsalRequested() {
 return process.env.NODE_ENV === "test" && process.env.INSPECTRA_ISOLATED_ISSUED_QUOTE === "1";
}
export function requireSealedQuoteFixture() {
 if (!sealedQuoteRehearsalRequested())
   fail("Internal sealed quote rehearsal is disabled.");
 if (!process.env.DATABASE_URL) fail("Missing isolated database.");
 const endpoint=new URL(process.env.DATABASE_URL);
 if(endpoint.protocol!=="mysql:" || endpoint.hostname!=="127.0.0.1" ||
   !/^\/synthetic_issued(?:_[a-z0-9]+)?$/.test(endpoint.pathname))
   fail("Internal sealed quote rehearsal requires its dedicated loopback fixture.");
}
const validId=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
function cents(v:unknown):bigint {
 if(typeof v!=="string"||!/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(v)) fail("Exact CAD cents required.");
 return BigInt(v.replace(".",""));
}
const money=(n:bigint)=>`${n/BigInt(100)}.${String(n%BigInt(100)).padStart(2,"0")}`;
function visible(v:unknown):string {
 if(typeof v!=="string" || !v.trim() || !/^[ -~]{1,160}$/.test(v)) fail("Source text cannot be rendered without ambiguity.");
 return v;
}
const sha=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex");
function canonical(v:unknown):string {
 if(v===null||typeof v!=="object") return JSON.stringify(v);
 if(Array.isArray(v)) return "["+v.map(canonical).join(",")+"]";
 return "{"+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,val])=>JSON.stringify(k)+":"+canonical(val)).join(",")+"}";
}
function render(terms:SealedTerms):Promise<Buffer> {
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:"LETTER",margin:54,info:{Title:"Issued Repair Quote "+terms.quoteNumber}});
  const parts:Buffer[]=[];
  doc.on("data",(part:Buffer)=>parts.push(part)); doc.on("error",reject); doc.on("end",()=>resolve(Buffer.concat(parts)));
  doc.font("Helvetica-Bold").fontSize(18).text("REPAIR QUOTE "+terms.quoteNumber);
  doc.moveDown().font("Helvetica").fontSize(10);
  for(const line of [`Issued version: ${terms.issueId}`,`Issued by: ${terms.issuerName}`,`Customer: ${terms.customerName}`,`Site: ${terms.siteName}`,
    `Issued: ${new Date(terms.issuedEpoch).toISOString()}`,`Accept before: ${new Date(terms.expiresEpoch).toISOString()}`,"Currency: CAD"]) doc.text(line);
  doc.moveDown();
  for(const line of terms.lines){
   doc.font("Helvetica-Bold").text(`Item #${line.id} | Qty ${line.quantity}: ${line.description}`);
   doc.font("Helvetica").text(`Net ${line.subtotal} | GST ${line.gst} | PST ${line.pst} | Total ${line.total}`).moveDown();
  }
  doc.font("Helvetica-Bold");
  for(const [label,value] of [["Subtotal",terms.subtotal],["GST",terms.gst],["PST",terms.pst],["CAD Total",terms.total]]) doc.text(`${label}: ${value}`);
  doc.end();
 });
}

type Tx=Parameters<Parameters<typeof db.withAudit>[2]>[0];
type Viewer=Awaited<ReturnType<typeof sdk.authenticateRequest>>;
async function inTransaction<T>(req:Request, action:string, fn:(tx:Tx,user:Viewer)=>Promise<T>) {
 requireSealedQuoteFixture();
 const user=await sdk.authenticateRequest(req);
 const ctx={user,req,requestId:randomUUID()} as TrpcContext;
 return db.withAudit(ctx,"isolated.issuedQuote."+action,async tx=>{
  const [fresh]=await tx.select().from(users).where(eq(users.id,user.id)).for("share");
  if(!fresh || fresh.isActive!==1 || fresh.companyId!==user.companyId || fresh.customerOrgId!==user.customerOrgId ||
    fresh.role!==user.role || fresh.sessionVersion!==user.sessionVersion || !validId(fresh.companyId))
     fail("Authenticated actor is no longer eligible.");
  return fn(tx,fresh);
 });
}
async function lockQuote(tx:Tx,user:Viewer,quoteId:number,action:"issue"|"accept") {
 if(!validId(quoteId) || !validId(user.companyId)) fail("Quote unavailable.");
 const [quote]=await tx.select().from(quotes).where(and(eq(quotes.id,quoteId),eq(quotes.companyId,user.companyId))).for("update");
 if(!quote || (action==="issue" ? !["office","admin"].includes(user.role) :
   user.role!=="customer" || user.customerOrgId!==quote.customerOrgId)) fail("Quote unavailable.");
 const [access]=await tx.select().from(quoteAccess).where(and(eq(quoteAccess.companyId,quote.companyId),
   eq(quoteAccess.customerOrgId,quote.customerOrgId),eq(quoteAccess.userId,user.id),eq(quoteAccess.action,action),
   isNull(quoteAccess.revokedAt))).for("share");
 if(!access || !validId(access.grantedBy) || access.grantedBy===user.id) fail("Named approval grant required.");
 const [customer]=await tx.select().from(customerOrgs).where(and(eq(customerOrgs.id,quote.customerOrgId),
   eq(customerOrgs.companyId,quote.companyId))).for("share");
 if(!customer) fail("Customer scope unavailable.");
 return {quote,customer};
}
async function latest(tx:Tx,companyId:number,quoteId:number) {
 const [row]=await tx.select({issueId:issueVersions.issueId}).from(issueVersions)
  .where(and(eq(issueVersions.companyId,companyId),eq(issueVersions.quoteId,quoteId)))
  .orderBy(desc(issueVersions.seq)).limit(1).for("share");
 return row?.issueId??null;
}
export async function sealIssue(req:Request,input:{quoteId:number;expectedPrevious:string|null}) {
 return inTransaction(req,"issue",async(tx,user)=>{
  const {quote,customer}=await lockQuote(tx,user,input.quoteId,"issue");
  if(quote.quoteType!=="repair"|| !quote.finalizedAt || quote.status!=="ready_to_send" || cents(quote.discount)!==BigInt(0))
    fail("Only a finalized, undiscounted, ready-to-send repair quote is eligible.");
  if(await latest(tx,quote.companyId,quote.id)!==input.expectedPrevious) fail("Stale issuance revision.");
  const [company]=await tx.select().from(companies).where(eq(companies.id,quote.companyId)).for("share");
  const [site]=await tx.select().from(sites).where(and(eq(sites.id,quote.siteId),eq(sites.companyId,quote.companyId),
    eq(sites.customerOrgId,quote.customerOrgId))).for("share");
  if(!company||!site) fail("Quote customer and site must reconcile.");
  const source=await tx.select().from(repairQuoteItems).where(eq(repairQuoteItems.quoteId,quote.id))
   .orderBy(asc(repairQuoteItems.id)).limit(26).for("share");
  if(!source.length || source.length>25) fail("A bounded exact quote line set is required.");
  const sum=[BigInt(0),BigInt(0),BigInt(0),BigInt(0)];
  const lines=source.map(item=>{
   if(!validId(item.id)||!validId(item.quantity) ||
     [item.repairNotes,item.location,item.systemType,item.partDescription].some(x=>x!=null && x.trim()!==""))
       fail("Line terms cannot safely be represented in this rehearsal.");
   const net=[item.partTotal,item.labourTotal,item.fuelCharge,item.backflowReportFee].reduce((s,v)=>s+cents(v),BigInt(0));
   const gst=cents(item.gst),pst=cents(item.pst),gross=cents(item.total);
   if(net+gst+pst!==gross||gross<=BigInt(0)) fail("Quote line amounts do not reconcile.");
   [net,gst,pst,gross].forEach((v,i)=>{sum[i]+=v;});
   return {id:item.id,quantity:item.quantity,description:visible(item.description),subtotal:money(net),gst:money(gst),pst:money(pst),total:money(gross)};
  });
  const [subtotal,gst,pst,total]=[quote.subtotal,quote.gst,quote.pst,quote.total];
  if([subtotal,gst,pst,total].map(cents).some((v,i)=>v!==sum[i])) fail("Quote header and lines do not reconcile.");
  if(quote.notes?.trim()) fail("Quote notes require a fuller renderer before issuance.");
  const issuedEpoch=Date.now();
  // Never issue past printed source date. The narrow prototype caps validity at 7 days.
  const validUntil=quote.validUntil instanceof Date && Number.isFinite(quote.validUntil.getTime()) ? quote.validUntil.toISOString().slice(0,10) : null;
  if(!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) fail("An explicit quote validity date is required.");
  const expiresEpoch=Math.min(Date.parse(validUntil+"T00:00:00Z"),issuedEpoch+7*86400*1000);
  if(!Number.isFinite(expiresEpoch)||expiresEpoch<=issuedEpoch) fail("Quote validity has expired.");
  const terms:SealedTerms={issueId:randomUUID(),companyId:quote.companyId,customerOrgId:quote.customerOrgId,
    siteId:quote.siteId,quoteId:quote.id,quoteNumber:visible(quote.quoteNumber),issuerName:visible(company.name),
    customerName:visible(customer.name),siteName:visible(site.name),currency:"CAD",issuedEpoch,expiresEpoch,
    lines,subtotal:subtotal!,gst:gst!,pst:pst!,total};
  const pdf=await render(terms);
  if(pdf.length<5||pdf.length>512*1024||pdf.subarray(0,5).toString()!=="%PDF-") fail("Invalid issued document.");
  const pdfDigest=sha(pdf),termsDigest=sha(canonical(terms));
  await tx.insert(issueVersions).values({issueId:terms.issueId,companyId:quote.companyId,customerOrgId:quote.customerOrgId,
    quoteId:quote.id,issuerId:user.id,terms,termsDigest,pdf,pdfDigest,issuedEpoch,expiresEpoch});
  return {issueId:terms.issueId,termsDigest,pdfDigest};
 });
}
async function sealed(tx:Tx,q:typeof quotes.$inferSelect,issueId:string) {
 const [row]=await tx.select().from(issueVersions).where(and(eq(issueVersions.issueId,issueId),
    eq(issueVersions.companyId,q.companyId),eq(issueVersions.customerOrgId,q.customerOrgId),eq(issueVersions.quoteId,q.id))).for("share");
 if(!row || !Buffer.isBuffer(row.pdf) || sha(row.pdf)!==row.pdfDigest || sha(canonical(row.terms))!==row.termsDigest ||
   row.terms.issueId!==row.issueId || row.terms.quoteId!==row.quoteId || row.terms.companyId!==row.companyId ||
   row.terms.customerOrgId!==row.customerOrgId || row.terms.issuedEpoch!==row.issuedEpoch || row.terms.expiresEpoch!==row.expiresEpoch)
   fail("Verified issued artifact unavailable.");
 return row;
}
export async function listIssuedQuotes(req:Request) {
 return inTransaction(req,"list",async(tx,user)=>{
  if(user.role!=="customer" || !validId(user.customerOrgId) || !validId(user.companyId)) fail("Quotes unavailable.");
  const [customer]=await tx.select().from(customerOrgs).where(and(eq(customerOrgs.id,user.customerOrgId),
    eq(customerOrgs.companyId,user.companyId))).for("share");
  if(!customer) fail("Customer scope unavailable.");
  const [access]=await tx.select().from(quoteAccess).where(and(eq(quoteAccess.companyId,user.companyId),
   eq(quoteAccess.customerOrgId,user.customerOrgId),eq(quoteAccess.userId,user.id),eq(quoteAccess.action,"accept"),
   isNull(quoteAccess.revokedAt))).for("share");
  if(!access || !validId(access.grantedBy) || access.grantedBy===user.id) return [];
  const rows=await tx.select({quoteId:issueVersions.quoteId,issueId:issueVersions.issueId,acceptedEpoch:issueAcceptances.acceptedEpoch})
   .from(issueVersions)
   .innerJoin(quotes,and(eq(quotes.id,issueVersions.quoteId),eq(quotes.companyId,issueVersions.companyId),
    eq(quotes.customerOrgId,issueVersions.customerOrgId)))
   .leftJoin(issueAcceptances,and(eq(issueAcceptances.issueId,issueVersions.issueId),eq(issueAcceptances.accepterId,user.id)))
   .where(and(eq(issueVersions.companyId,user.companyId),eq(issueVersions.customerOrgId,user.customerOrgId),
    sql`NOT EXISTS (SELECT 1 FROM issued_quote_versions later WHERE later.companyId = ${issueVersions.companyId} AND later.quoteId = ${issueVersions.quoteId} AND later.seq > ${issueVersions.seq})`))
   .orderBy(desc(issueVersions.seq)).limit(50);
  return rows;
 });
}
type CustomerScope = { companyId:number|null; customerOrgId:number|null };
function requireCustomerScope(user:Viewer,scope:CustomerScope) {
 if(!validId(scope.companyId)||!validId(scope.customerOrgId)||
    user.companyId!==scope.companyId||user.customerOrgId!==scope.customerOrgId)
   fail("Customer scope unavailable.");
}
export async function readIssue(req:Request,input:{quoteId:number;issueId:string},scope:CustomerScope) {
 return inTransaction(req,"read",async(tx,user)=>{
  requireCustomerScope(user,scope);
  const {quote}=await lockQuote(tx,user,input.quoteId,"accept");
  const row=await sealed(tx,quote,input.issueId);
  return {pdf:row.pdf,pdfDigest:row.pdfDigest,terms:row.terms};
 });
}
export async function acceptIssue(req:Request,input:{quoteId:number;issueId:string;presentedPdfDigest:string},scope:CustomerScope) {
 return inTransaction(req,"accept",async(tx,user)=>{
  requireCustomerScope(user,scope);
  const {quote}=await lockQuote(tx,user,input.quoteId,"accept");
  const row=await sealed(tx,quote,input.issueId);
  if(input.presentedPdfDigest!==row.pdfDigest) fail("Presented PDF does not match this issued version.");
  const [prev]=await tx.select().from(issueAcceptances).where(eq(issueAcceptances.issueId,row.issueId)).for("share");
  if(prev) {
   if(prev.accepterId!==user.id || prev.pdfDigest!==row.pdfDigest || prev.termsDigest!==row.termsDigest ||
      prev.companyId!==row.companyId || prev.customerOrgId!==row.customerOrgId || prev.quoteId!==row.quoteId)
      fail("Issue already accepted or acceptance requires review.");
   return prev;
  }
  const acceptedEpoch=Date.now();
  if(acceptedEpoch<row.issuedEpoch || acceptedEpoch>=row.expiresEpoch || await latest(tx,row.companyId,row.quoteId)!==row.issueId)
    fail("Issued quote is stale or expired.");
  const receipt={issueId:row.issueId,companyId:row.companyId,customerOrgId:row.customerOrgId,quoteId:row.quoteId,
    accepterId:user.id,acceptedEpoch,termsDigest:row.termsDigest,pdfDigest:row.pdfDigest};
  await tx.insert(issueAcceptances).values(receipt);
  return receipt;
 });
}
