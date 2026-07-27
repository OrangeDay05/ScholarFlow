const dualModelReviewFlag =
  process.env.NEXT_PUBLIC_DUAL_MODEL_REVIEW_MOCK;

export const DUAL_MODEL_REVIEW_MOCK_ENABLED =
  dualModelReviewFlag !== "false" && dualModelReviewFlag !== "0";
