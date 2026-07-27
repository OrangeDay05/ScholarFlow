export const M4_PRIVACY_MODES = [
  "RAW_ALLOWED",
  "SELECTIVE_REDACTION",
  "PSEUDONYMIZED",
  "AGGREGATED_ONLY",
  "LOCAL_ONLY",
  "EXTERNAL_BLOCKED",
] as const;

export type M4PrivacyMode = (typeof M4_PRIVACY_MODES)[number];

export const M4_FIDELITY_CHECKS = [
  "EXPERIMENTAL_CONDITIONS",
  "SAMPLE_COUNT",
  "PARTICIPANT_SEPARATION",
  "CHRONOLOGY",
  "RESEARCH_NECESSARY_VARIABLES",
  "NUMERIC_PRECISION",
  "SPEAKER_RELATIONSHIPS",
] as const;

export type M4FidelityCheckType = (typeof M4_FIDELITY_CHECKS)[number];

export type M4PrivacyProfileInput = {
  materialId: string;
  directIdentifiers: string[];
  indirectIdentifiers: string[];
  sensitiveAttributes: string[];
  researchNecessaryVariables: string[];
  ordinaryResearchContent: string[];
  confidentialityRestrictions: string[];
  copyrightRestrictions: string[];
  recommendedMode: M4PrivacyMode;
  confirm: boolean;
};

export type M4FidelityCheckInput = {
  type: M4FidelityCheckType;
  status: "PASSED" | "WARNING" | "FAILED";
  detail: string;
  blocking: boolean;
};

export type M4ProcessingCopyInput = {
  materialId: string;
  profileId: string;
  mode: M4PrivacyMode;
  storageReference?: string;
  contentHash?: string;
  transformations: string[];
  approvedByUser: boolean;
  fidelityChecks: M4FidelityCheckInput[];
};

export type M4PrivacyWorkspace = {
  profiles: Array<
    M4PrivacyProfileInput & {
      id: string;
      status: "DRAFT" | "CONFIRMED" | "NEEDS_REVIEW";
    }
  >;
  copies: Array<{
    id: string;
    materialId: string;
    profileId: string;
    mode: M4PrivacyMode;
    status: "DRAFT" | "READY" | "BLOCKED";
    fidelityStatus: "PASSED" | "PASSED_WITH_WARNINGS" | "FAILED";
    approvedByUser: boolean;
    fidelityChecks: M4FidelityCheckInput[];
  }>;
  transmissions: Array<{
    id: string;
    taskId: string;
    materialId: string;
    processingCopyId: string;
    providerKey: string;
    purpose: string;
    status: "PLANNED" | "BLOCKED" | "RECORDED";
    blockReason: string | null;
  }>;
};
