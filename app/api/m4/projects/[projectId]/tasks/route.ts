import {
  M4_TASK_ROLES,
  M4_TASK_STATUSES,
  type CreateM4ReviewInput,
  type CreateM4TaskInput,
  type M4ReviewDecision,
  type M4ReviewIssueInput,
  type M4TaskModelAssignmentInput,
} from "@/app/lib/m4-task-contracts";
import {
  adoptM4SectionVersion,
  createM4ReviewReport,
  createM4Task,
  decideM4ReviewIssue,
  loadM4TaskWorkspace,
  transitionM4Task,
} from "@/db/repositories/m4-tasks";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

const reviewModes = ["none", "standard", "strict", "custom"] as const;
const reviewConclusions = [
  "PASSED",
  "PASSED_WITH_WARNINGS",
  "REVISION_REQUIRED",
  "BLOCKED",
  "REVIEW_FAILED",
] as const;
const reviewDecisions: M4ReviewDecision[] = [
  "ACCEPTED_ORIGINAL",
  "SELECTED_FOR_REVISION",
  "IGNORED",
  "REVIEW_AGAIN",
];
const candidateTypes = [
  "GENERATED",
  "AGGREGATED",
  "REVISED",
  "RESTORED",
] as const;
const modelLimits = { none: 1, standard: 2, strict: 3, custom: 4 };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await loadM4TaskWorkspace(auth.actor, (await params).projectId),
    );
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return apiError(400, "INVALID_ACTION", "缺少 AI 任务操作类型。");
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action) {
      case "create": {
        const input = parseCreateTask(body);
        return input
          ? apiSuccess(await createM4Task(auth.actor, projectId, input), 201)
          : apiError(400, "INVALID_TASK", "AI 任务参数或模型上限无效。");
      }
      case "transition": {
        const taskId = text(body.task_id);
        const status = text(body.to_status);
        const callsDelta = integer(body.calls_delta, 0, 4);
        if (
          !taskId ||
          !M4_TASK_STATUSES.includes(
            status as (typeof M4_TASK_STATUSES)[number],
          ) ||
          callsDelta === null
        ) {
          return apiError(400, "INVALID_TRANSITION", "任务状态转换参数无效。");
        }
        return apiSuccess(
          await transitionM4Task(
            auth.actor,
            projectId,
            taskId,
            status as (typeof M4_TASK_STATUSES)[number],
            {
              reason: text(body.reason) || undefined,
              callsDelta,
              resultVersionId: text(body.result_version_id) || undefined,
            },
          ),
        );
      }
      case "review": {
        const input = parseReview(body);
        return input
          ? apiSuccess(
              await createM4ReviewReport(auth.actor, projectId, input),
              201,
            )
          : apiError(400, "INVALID_REVIEW", "审阅报告参数无效。");
      }
      case "decide": {
        const reportId = text(body.report_id);
        const decision = text(body.decision) as M4ReviewDecision;
        if (!reportId || !reviewDecisions.includes(decision)) {
          return apiError(400, "INVALID_DECISION", "审阅处理决定无效。");
        }
        return apiSuccess(
          await decideM4ReviewIssue(auth.actor, projectId, {
            reportId,
            issueId: text(body.issue_id) || undefined,
            decision,
            reason: text(body.reason) || undefined,
            resolvedVersionId: text(body.resolved_version_id) || undefined,
          }),
          201,
        );
      }
      case "adopt": {
        const sectionId = text(body.section_id);
        const versionId = text(body.version_id);
        const candidateType = text(body.candidate_type);
        if (
          !sectionId ||
          !versionId ||
          !candidateTypes.includes(
            candidateType as (typeof candidateTypes)[number],
          )
        ) {
          return apiError(400, "INVALID_ADOPTION", "采用版本参数无效。");
        }
        return apiSuccess(
          await adoptM4SectionVersion(auth.actor, projectId, {
            sectionId,
            versionId,
            sourceTaskId: text(body.source_task_id) || undefined,
            candidateType: candidateType as (typeof candidateTypes)[number],
          }),
        );
      }
      default:
        return apiError(400, "INVALID_ACTION", "不支持的 AI 任务操作。");
    }
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function parseCreateTask(body: Record<string, unknown>): CreateM4TaskInput | null {
  const taskRole = text(body.task_role);
  const reviewMode = text(body.review_mode);
  const maxCalls = integer(body.max_calls, 1, 4);
  const timeoutSeconds = integer(body.timeout_seconds, 10, 600);
  const materials = stringArray(body.selected_material_ids);
  const models = parseModels(body.models);
  if (
    !M4_TASK_ROLES.includes(taskRole as (typeof M4_TASK_ROLES)[number]) ||
    !reviewModes.includes(reviewMode as (typeof reviewModes)[number]) ||
    !text(body.product_skill) ||
    !text(body.task_type) ||
    !text(body.idempotency_key) ||
    maxCalls === null ||
    timeoutSeconds === null ||
    !materials ||
    !models ||
    models.length > modelLimits[reviewMode as keyof typeof modelLimits] ||
    new Set(models.map((model) => model.role)).size !== models.length
  ) {
    return null;
  }
  return {
    parentTaskId: text(body.parent_task_id) || undefined,
    sectionId: text(body.section_id) || undefined,
    taskRole: taskRole as CreateM4TaskInput["taskRole"],
    productSkill: text(body.product_skill),
    taskType: text(body.task_type),
    reviewMode: reviewMode as CreateM4TaskInput["reviewMode"],
    selectedMaterialIds: materials,
    reviewedVersionId: text(body.reviewed_version_id) || undefined,
    maxCalls,
    timeoutSeconds,
    idempotencyKey: text(body.idempotency_key),
    models,
  };
}

function parseModels(value: unknown): M4TaskModelAssignmentInput[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const models: M4TaskModelAssignmentInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const role = text(item.role);
    if (
      !M4_TASK_ROLES.includes(role as (typeof M4_TASK_ROLES)[number]) ||
      !text(item.provider_key) ||
      !text(item.model_key) ||
      !text(item.model_version) ||
      !text(item.skill_key) ||
      !text(item.skill_version)
    ) {
      return null;
    }
    models.push({
      role: role as M4TaskModelAssignmentInput["role"],
      providerKey: text(item.provider_key),
      modelKey: text(item.model_key),
      modelVersion: text(item.model_version),
      skillKey: text(item.skill_key),
      skillVersion: text(item.skill_version),
    });
  }
  return models;
}

function parseReview(body: Record<string, unknown>): CreateM4ReviewInput | null {
  const taskId = text(body.task_id);
  const reviewedVersionId = text(body.reviewed_version_id);
  const conclusion = text(body.conclusion);
  const summary = text(body.summary);
  const context = body.context_snapshot;
  const issues = parseIssues(body.issues);
  if (
    !taskId ||
    !reviewedVersionId ||
    !reviewConclusions.includes(
      conclusion as (typeof reviewConclusions)[number],
    ) ||
    !summary ||
    !isRecord(context) ||
    !text(context.user_requirement) ||
    !text(context.diagnosis_card_id) ||
    !text(context.generated_version_id) ||
    !stringArray(context.material_ids) ||
    !stringArray(context.evidence_binding_ids) ||
    !issues
  ) {
    return null;
  }
  return {
    taskId,
    reviewedVersionId,
    conclusion: conclusion as CreateM4ReviewInput["conclusion"],
    summary,
    contextSnapshot: {
      userRequirement: text(context.user_requirement),
      diagnosisCardId: text(context.diagnosis_card_id),
      materialIds: stringArray(context.material_ids)!,
      generatedVersionId: text(context.generated_version_id),
      evidenceBindingIds: stringArray(context.evidence_binding_ids)!,
    },
    issues,
  };
}

function parseIssues(value: unknown): M4ReviewIssueInput[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const issues: M4ReviewIssueInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const severity = text(item.severity);
    const modelSources = stringArray(item.model_sources);
    const evidenceBindingIds = stringArray(item.evidence_binding_ids);
    if (
      !["HIGH", "MEDIUM", "LOW"].includes(severity) ||
      !text(item.category) ||
      !text(item.title) ||
      !text(item.detail) ||
      !text(item.suggestion) ||
      !modelSources ||
      !evidenceBindingIds
    ) {
      return null;
    }
    issues.push({
      category: text(item.category),
      severity: severity as M4ReviewIssueInput["severity"],
      title: text(item.title),
      detail: text(item.detail),
      suggestion: text(item.suggestion),
      modelSources,
      evidenceBindingIds,
    });
  }
  return issues;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result = value.map(text);
  return result.every(Boolean) ? result : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
