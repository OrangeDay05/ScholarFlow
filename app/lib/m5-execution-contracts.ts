import type { M4TaskRole } from "./m4-task-contracts";

export const M5_PRODUCT_SKILLS = [
  "project_diagnosis_outline",
  "literature_summary_matrix",
  "chapter_writing",
  "general_revision",
  "consistency_check",
  "citation_evidence_check",
] as const;

export type M5ProductSkill = (typeof M5_PRODUCT_SKILLS)[number];
export type M5ExecutionMode = "STANDARD" | "STRICT" | "CUSTOM";

export const M5_EXECUTION_LIMITS: Record<
  M5ExecutionMode,
  { maxModels: number; maxCalls: number }
> = {
  STANDARD: { maxModels: 2, maxCalls: 2 },
  STRICT: { maxModels: 3, maxCalls: 4 },
  CUSTOM: { maxModels: 4, maxCalls: 5 },
};

export type M5SkillContext = {
  runId: string;
  ownerUserId: string;
  projectId: string;
  productSkill: M5ProductSkill;
  language: "zh" | "en";
  paperType: string;
  requestedOperation: string;
  confirmedDiagnosisCardId: string | null;
  projectRequirementIds: string[];
  authorizedMaterialIds: string[];
  chapterId: string | null;
  modelConfigId: string;
  externalSearchEnabled: boolean;
};

export type M5ExecutionRequest = {
  context: M5SkillContext;
  mode: M5ExecutionMode;
  roles: M4TaskRole[];
  maxCalls: number;
  timeoutSeconds: number;
};

export type M5SkillResult = {
  runId: string;
  status: "SUCCEEDED" | "NEEDS_INPUT" | "FAILED" | "CANCELLED";
  resultType:
    | "DIAGNOSIS_CARD"
    | "OUTLINE"
    | "LITERATURE_MATRIX"
    | "CHAPTER_VERSION"
    | "REVISION_VERSION"
    | "CHECK_REPORT"
    | "EVIDENCE_REPORT";
  content: unknown;
  missingInputs: string[];
  warnings: string[];
  evidenceBindingIds: string[];
  createdVersionId: string | null;
  providerRecord: {
    providerKey: string;
    modelKey: string;
    modelVersion: string;
    skillKey: string;
    skillVersion: string;
  } | null;
};

export type M5ExecutionValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function validateM5ExecutionRequest(
  request: M5ExecutionRequest,
): M5ExecutionValidation {
  const limits = M5_EXECUTION_LIMITS[request.mode];
  if (!request.context.runId || !request.context.projectId) {
    return invalid("INVALID_CONTEXT", "任务必须绑定运行 ID 和项目。");
  }
  if (!M5_PRODUCT_SKILLS.includes(request.context.productSkill)) {
    return invalid("INVALID_PRODUCT_SKILL", "任务必须使用六个产品级 Skill 之一。");
  }
  if (
    request.roles.length === 0 ||
    request.roles.length > limits.maxModels ||
    new Set(request.roles).size !== request.roles.length
  ) {
    return invalid("INVALID_MODEL_ROLES", "模型角色数量或唯一性不符合当前模式。");
  }
  if (request.maxCalls < 1 || request.maxCalls > limits.maxCalls) {
    return invalid("CALL_BUDGET_EXCEEDED", "预计调用次数超过当前模式上限。");
  }
  if (request.timeoutSeconds < 10 || request.timeoutSeconds > 600) {
    return invalid("INVALID_TIMEOUT", "任务超时必须在 10—600 秒之间。");
  }
  if (
    request.context.productSkill === "chapter_writing" &&
    !request.context.confirmedDiagnosisCardId
  ) {
    return invalid(
      "DIAGNOSIS_CONFIRMATION_REQUIRED",
      "正式章节写作需要已确认诊断卡。",
    );
  }
  if (
    request.context.authorizedMaterialIds.some((id) => !id.trim()) ||
    new Set(request.context.authorizedMaterialIds).size !==
      request.context.authorizedMaterialIds.length
  ) {
    return invalid("INVALID_MATERIAL_SCOPE", "材料授权范围包含空值或重复项。");
  }
  return { ok: true };
}

export const M5_RECOVERABLE_TASK_STATUSES = [
  "QUEUED",
  "PREPARING_CONTEXT",
  "PARSING",
  "RETRIEVING",
  "CALLING_MODEL",
  "GENERATING",
  "REVIEWING",
  "VERIFYING",
  "REVISING",
  "AGGREGATING",
  "RETRYING",
  "BUDGET_PAUSED",
] as const;

export type M5RecoveryDecision = "RESUME" | "WAIT_FOR_USER" | "TERMINAL";

export function recoveryDecision(status: string): M5RecoveryDecision {
  if (status === "WAITING_FOR_USER_CONFIRMATION") return "WAIT_FOR_USER";
  return M5_RECOVERABLE_TASK_STATUSES.includes(
    status as (typeof M5_RECOVERABLE_TASK_STATUSES)[number],
  )
    ? "RESUME"
    : "TERMINAL";
}

function invalid(code: string, message: string): M5ExecutionValidation {
  return { ok: false, code, message };
}
