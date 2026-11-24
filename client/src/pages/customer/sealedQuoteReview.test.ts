import { describe, expect, it } from "vitest";
import { reviewedAcceptance } from "./sealedQuoteReview";
describe("sealed quote portal acceptance interface",()=>{
 const active={quoteId:4,issueId:"fixture-2"};
 const proof={pdfDigest:"hash-2",reviewToken:"ticket-2",expiresAt:200};
 const openedFor={...active,pdfDigest:proof.pdfDigest};
 const request={active,proof,openedFor,confirmation:true,now:100};
 it("sends only an explicitly opened and confirmed exact version and proof",()=>{
  expect(reviewedAcceptance(request)).toEqual({...active,...proof});
  expect(reviewedAcceptance({...request,confirmation:false})).toBeNull();
  expect(reviewedAcceptance({...request,openedFor:null})).toBeNull();
 });
 it("blocks stale quote/version, same-version different PDF and expired proof",()=>{
  expect(reviewedAcceptance({...request,active:{...active,issueId:"fixture-3"}})).toBeNull();
  expect(reviewedAcceptance({...request,active:{...active,quoteId:8}})).toBeNull();
  expect(reviewedAcceptance({...request,proof:{...proof,pdfDigest:"other-hash"}})).toBeNull();
  expect(reviewedAcceptance({...request,now:200})).toBeNull();
 });
});
