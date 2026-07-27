export const M4_TASK_ROLES = [
  "ROUTER",
  "GENERATOR",
  "REVIEWER",
  "VERIFIER",
  "REVISER",
  "AGGREGATOR",
] as const;

export type M4TaskRole = (typeof M4_TASK_ROLES)[number];

export const M4_TASK_STATUSES = [
  "QUEUED",
  "PREPARING_CONTEXT",
  "PARSING",
  "RETRIEVING",
  "WAITING_FOR_USER_CONFIRMATION",
  "CALLING_MODEL",
  "GENERATING",
  "REVIEWING",
  "VERIFYING",
  "REVISING",
  "AGGREGATING",
  "RETRYING",
  "PARTIALLY_COMPLETED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
  "BUDGET_PAUSED",
] as const;

export type M4TaskStatus = (typeof M4_TASK_STATUSES)[number];
export type M4ReviewConclusion =
  | "PASSED"
  | "PASSED_WITH_WARNINGS"
  | "REVISION_REQUIRED"
  | "BLOCKED"
  | "REVIEW_FAILED";
export type M4ReviewDecision =
  | "ACCEPTED_ORIGINAL"
  | "SELECTED_FOR_REVISION"
  | "IGNORED"
  | "REVIEW_AGAIN";

export type M4TaskModelAssignmentInput = {
  role: M4TaskRole;
  providerKey: string;
  modelKey: string;
  modelVersion: string;
  skillKey: string;
  skillVersion: string;
};

export type CreateM4TaskInput = {
  parentTaskId?: string;
  sectionId?: string;
  taskRole: M4TaskRole;
  productSkill: string;
  taskType: string;
  reviewMode: "none" | "standard" | "strict" | "custom";
  selectedMaterialIds: string[];
  reviewedVersionId?: string;
  maxCalls: number;
  timeoutSeconds: number;
  idempotencyKey: string;
  models: M4TaskModelAssignmentInput[];
};

export type M4TaskRecord = {
  id: string;
  parentTaskId: string | null;
  taskRole: M4TaskRole;
  status: M4TaskStatus;
  productSkill: string;
  taskType: string;
  reviewMode: CreateM4TaskInput["reviewMode"];
  maxCalls: number;
  callsUsed: number;
  timeoutSeconds: number;
  stopReason: string | null;
  reviewedVersionId: string | null;
  resultVersionId: string | null;
  models: M4TaskModelAssignmentInput[];
};

export type M4ReviewIssueInput = {
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  detail: string;
  suggestion: string;
  modelSources: string[];
  evidenceBindingIds: string[];
};

export type CreateM4ReviewInput = {
  taskId: string;
  reviewedVersionId: string;
  conclusion: M4ReviewConclusion;
  summary: string;
  contextSnapshot: {
    userRequirement: string;
    diagnosisCardId: string;
    materialIds: string[];
    generatedVersionId: string;
    evidenceBindingIds: string[];
  };
  issues: M4ReviewIssueInput[];
};

export type M4TaskWorkspace = {
  tasks: M4TaskRecord[];
  reports: Array<{
    id: string;
    taskId: string;
    reviewedVersionId: string;
    conclusion: M4ReviewConclusion;
    summary: string;
    issues: Array<M4ReviewIssueInput & { id: string }>;
  }>;
  decisions: Array<{
    id: string;
    reportId: string;
    issueId: string | null;
    decision: M4ReviewDecision;
    reason: string | null;
    resolvedVersionId: string | null;
  }>;
  adoptions: Array<{
    id: string;
    sectionId: string;
    versionId: string;
    candidateType: "GENERATED" | "AGGREGATED" | "REVISED" | "RESTORED";
    adopted: boolean;
  }>;
};
