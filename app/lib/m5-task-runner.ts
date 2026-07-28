import type { M4TaskRole } from "./m4-task-contracts";
import type { M5ExecutionMode, M5SkillContext } from "./m5-execution-contracts";
import { M5_EXECUTION_LIMITS, validateM5ExecutionRequest } from "./m5-execution-contracts";
import type { M5ProviderAdapter, M5ProviderResult } from "./m5-provider-adapter";
import { runWithProviderTimeout } from "./m5-provider-adapter";
import { buildM5SkillProviderRequest } from "./m5-skill-adapters";

export type M5RunnerAssignment = {
  role: M4TaskRole;
  provider: M5ProviderAdapter;
  credential: string;
  modelKey: string;
  modelVersion: string;
};

export type M5RunnerArtifact = {
  role: M4TaskRole;
  result: M5ProviderResult;
  artifactType: "GENERATED_CANDIDATE" | "REVIEW_REPORT" | "VERIFICATION_REPORT" | "REVISION_CANDIDATE" | "AGGREGATED_CANDIDATE";
};

export type M5RunnerOutcome = {
  status: "SUCCEEDED" | "PARTIALLY_COMPLETED" | "FAILED" | "BUDGET_PAUSED" | "CANCELLED";
  callsUsed: number;
  artifacts: M5RunnerArtifact[];
  stopReason: string;
  errorCode: string | null;
};

export async function runM5BoundedTask(input: {
  context: M5SkillContext;
  mode: M5ExecutionMode;
  assignments: M5RunnerAssignment[];
  userInstruction: string;
  materialContext: string;
  maxCalls: number;
  timeoutSeconds: number;
  maxOutputTokens: number;
  budgetAllowsCall: (nextCallNumber: number, assignment: M5RunnerAssignment) => Promise<boolean>;
  signal?: AbortSignal;
}): Promise<M5RunnerOutcome> {
  const validation = validateM5ExecutionRequest({ context: input.context, mode: input.mode, roles: input.assignments.map((item) => item.role), maxCalls: input.maxCalls, timeoutSeconds: input.timeoutSeconds });
  if (!validation.ok) return { status: "FAILED", callsUsed: 0, artifacts: [], stopReason: validation.message, errorCode: validation.code };
  const limits = M5_EXECUTION_LIMITS[input.mode];
  if (input.assignments.length > limits.maxModels || input.maxCalls > limits.maxCalls) return { status: "FAILED", callsUsed: 0, artifacts: [], stopReason: "执行配置超过模式上限。", errorCode: "CALL_BUDGET_EXCEEDED" };
  const artifacts: M5RunnerArtifact[] = [];
  let callsUsed = 0;
  for (const assignment of input.assignments) {
    if (callsUsed >= input.maxCalls) break;
    if (input.signal?.aborted) return outcome(artifacts, callsUsed, "CANCELLED", "用户取消。", "USER_CANCELLED");
    if (!await input.budgetAllowsCall(callsUsed + 1, assignment)) return outcome(artifacts, callsUsed, "BUDGET_PAUSED", "预算确认未通过。", "BUDGET_CONFIRMATION_REQUIRED");
    const generated = artifacts.find((item) => item.role === "GENERATOR")?.result.outputText ?? "";
    const request = buildM5SkillProviderRequest({
      context: input.context,
      modelKey: assignment.modelKey,
      modelVersion: assignment.modelVersion,
      taskRole: assignment.role,
      userInstruction: assignment.role === "GENERATOR" ? input.userInstruction : `${input.userInstruction}\n\n待${assignment.role === "REVIEWER" ? "审阅" : "验证"}的生成版本：\n${generated}`,
      materialContext: input.materialContext,
      timeoutSeconds: input.timeoutSeconds,
      maxOutputTokens: input.maxOutputTokens,
    });
    try {
      const result = await runWithProviderTimeout(input.timeoutSeconds, (signal) => assignment.provider.execute(request, assignment.credential, signal));
      callsUsed += 1;
      artifacts.push({ role: assignment.role, result, artifactType: artifactType(assignment.role) });
    } catch (error) {
      callsUsed += 1;
      const code = error instanceof Error && "code" in error ? String(error.code) : "PROVIDER_FAILED";
      return outcome(artifacts, callsUsed, artifacts.length ? "PARTIALLY_COMPLETED" : "FAILED", "模型调用失败；已成功产物已保留。", code);
    }
  }
  if (!artifacts.some((item) => item.role === "GENERATOR")) return outcome(artifacts, callsUsed, artifacts.length ? "PARTIALLY_COMPLETED" : "FAILED", "没有生成模型产物。", "GENERATION_MISSING");
  return outcome(artifacts, callsUsed, "SUCCEEDED", "有界执行完成；审阅和验证报告不会覆盖正文。", null);
}

function artifactType(role: M4TaskRole): M5RunnerArtifact["artifactType"] {
  return role === "REVIEWER" ? "REVIEW_REPORT" : role === "VERIFIER" ? "VERIFICATION_REPORT" : role === "REVISER" ? "REVISION_CANDIDATE" : role === "AGGREGATOR" ? "AGGREGATED_CANDIDATE" : "GENERATED_CANDIDATE";
}
function outcome(artifacts: M5RunnerArtifact[], callsUsed: number, status: M5RunnerOutcome["status"], stopReason: string, errorCode: string | null): M5RunnerOutcome { return { status, callsUsed, artifacts, stopReason, errorCode }; }
