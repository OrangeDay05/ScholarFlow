const dualModelReviewFlag =
  process.env.NEXT_PUBLIC_DUAL_MODEL_REVIEW_MOCK;

export const DUAL_MODEL_REVIEW_MOCK_ENABLED =
  process.env.NODE_ENV !== "production" && dualModelReviewFlag === "true";
