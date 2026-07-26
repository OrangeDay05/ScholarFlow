const v042Flag = process.env.NEXT_PUBLIC_V042_INCREMENTAL_MOCK;

export const V042_INCREMENTAL_MOCK_ENABLED =
  v042Flag !== "false" && v042Flag !== "0";
