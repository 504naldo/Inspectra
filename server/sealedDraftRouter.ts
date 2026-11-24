import { z } from "zod";
import { router } from "./_core/trpc";
import { officeProcedure } from "./_core/trpc";
import { renderSealedFixtureDraftReview } from "./sealedDraftReviewPdf";
import { createSealedFixtureDraft,readSealedFixtureDraft } from "./sealedDraftService";
const id=z.number().int().min(1).max(2_147_483_647);
const draftReview=z.object({draftKey:z.string().regex(/^sd_[0-9a-f-]{36}$/),expectedTermsDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const sealedDraftFixtureRouter=router({
  detail:officeProcedure.input(draftReview).query(({ctx,input})=>{
   ctx.res.setHeader("Cache-Control","private, no-store");
   return readSealedFixtureDraft(ctx,input);
  }),
  pdf:officeProcedure.input(draftReview).query(async({ctx,input})=>{
   ctx.res.setHeader("Cache-Control","private, no-store");
   const data=await readSealedFixtureDraft(ctx,input);
   const pdf=await renderSealedFixtureDraftReview(data);
   return {kind:"private_review_only",mime:"application/pdf",pdf:pdf.toString("base64")};
  }),
  create:officeProcedure.input(z.object({quoteId:id,issueId:z.string().uuid(),
    expectedTermsDigest:z.string().regex(/^[a-f0-9]{64}$/),
    scope:z.discriminatedUnion("kind",[z.object({kind:z.literal("whole")}).strict(),
      z.object({kind:z.literal("item"),quoteItemId:id}).strict()])}).strict())
    .mutation(({ctx,input})=>createSealedFixtureDraft(ctx,input,ctx.user.companyId)),
});
