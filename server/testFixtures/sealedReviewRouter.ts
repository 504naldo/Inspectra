import { router } from "../_core/trpc";
import { sealedQuoteRouter } from "../routers/sealedQuoteRouter";
import { sealedDraftFixtureRouter } from "../sealedDraftRouter";

// Test-only contract. Do not mount in the ordinary application router.
export const sealedReviewFixtureRouter = router({
  sealedQuote: sealedQuoteRouter,
  sealedDraftFixture: sealedDraftFixtureRouter,
});

export type SealedReviewFixtureRouter = typeof sealedReviewFixtureRouter;
