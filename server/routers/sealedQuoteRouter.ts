import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { customerProcedure, router } from "../_core/trpc";
import type { User } from "../../drizzle/schema";
import { acceptIssue, listIssuedQuotes, readIssue, requireSealedQuoteFixture, sealedQuoteRehearsalRequested } from "../issuedQuoteService";

const exactVersion = z.object({ quoteId:z.number().int().positive(), issueId:z.string().uuid() });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const denied=()=>new TRPCError({code:"PRECONDITION_FAILED",message:"Open the exact issued PDF again before accepting."});
function sign(user:User,quote:number,issue:string,pdfDigest:string,until:number) {
 const key=process.env.JWT_SECRET;
 if(!key||key.length<32) throw denied();
 return createHmac("sha256",key).update(JSON.stringify(["inspectra:sealed-preview:fixture:v1",
   user.id,user.companyId,user.customerOrgId,user.sessionVersion,quote,issue,pdfDigest,until])).digest("hex");
}
export const sealedQuoteRouter=router({
 mode:customerProcedure.query(()=>({enabled:sealedQuoteRehearsalRequested()})),
 list:customerProcedure.query(({ctx})=>{
  ctx.res.setHeader("Cache-Control","private, no-store");
  return listIssuedQuotes(ctx.req);
 }),
 preview:customerProcedure.input(exactVersion).query(async({ctx,input})=>{
  requireSealedQuoteFixture();
  ctx.res.setHeader("Cache-Control","private, no-store");
  const result=await readIssue(ctx.req,input,{companyId:ctx.user.companyId,customerOrgId:ctx.user.customerOrgId});
  const expiresAt=Date.now()+10*60*1000;
  const reviewToken=sign(ctx.user,input.quoteId,input.issueId,result.pdfDigest,expiresAt);
  // Never return storage credentials, actor details or a mutable external URL.
  return {pdf:result.pdf.toString("base64"),pdfDigest:result.pdfDigest,reviewToken,expiresAt,
    quoteNumber:result.terms.quoteNumber,siteName:result.terms.siteName,total:result.terms.total};
 }),
 accept:customerProcedure.input(exactVersion.extend({
  pdfDigest:digest,reviewToken:digest,expiresAt:z.number().int().positive(),
 })).mutation(({ctx,input})=>{
  requireSealedQuoteFixture();
  ctx.res.setHeader("Cache-Control","private, no-store");
  if(Date.now()>=input.expiresAt||input.expiresAt-Date.now()>10*60*1000) throw denied();
  const expected=sign(ctx.user,input.quoteId,input.issueId,input.pdfDigest,input.expiresAt);
  if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(input.reviewToken,"hex"))) throw denied();
  return acceptIssue(ctx.req,{quoteId:input.quoteId,issueId:input.issueId,presentedPdfDigest:input.pdfDigest},
    {companyId:ctx.user.companyId,customerOrgId:ctx.user.customerOrgId});
 }),
});
