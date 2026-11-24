export type IssuedQuoteKey={quoteId:number;issueId:string};
export type ReviewProof={pdfDigest:string;reviewToken:string;expiresAt:number};
export function reviewedAcceptance(input:{
 active:IssuedQuoteKey; openedFor:(IssuedQuoteKey & {pdfDigest:string})|null; confirmation:boolean;
 proof:ReviewProof|undefined; now:number;
}) {
 const { active,openedFor,confirmation,proof,now }=input;
 if (!openedFor || !confirmation || !proof || proof.expiresAt<=now ||
   openedFor.quoteId!==active.quoteId || openedFor.issueId!==active.issueId || openedFor.pdfDigest!==proof.pdfDigest) return null;
 return {quoteId:active.quoteId,issueId:active.issueId,pdfDigest:proof.pdfDigest,
   reviewToken:proof.reviewToken,expiresAt:proof.expiresAt};
}
