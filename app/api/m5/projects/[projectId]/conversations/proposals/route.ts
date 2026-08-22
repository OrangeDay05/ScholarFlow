import {
  M5_PRODUCT_SKILLS,
  type M5ProductSkill,
} from "@/app/lib/m5-execution-contracts";
import {
  createM5ActionProposalForActor,
  deleteM5ActionProposalForActor,
  decideM5ActionProposalForActor,
  loadM5ActionProposalWorkspace,
  M5ActionProposalRepositoryError,
} from "@/db/repositories/m5-action-proposals";
import { apiError, apiSuccess, isRecord } from "../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../m4/_shared";

const safeId = /^[a-zA-Z0-9:_-]{8,128}$/u;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const sessionId = idValue(new URL(request.url).searchParams.get("session_id"));
  if (!sessionId) return invalidInput();
  try {
    return apiSuccess(
      await loadM5ActionProposalWorkspace(
        auth.actor,
        (await params).projectId,
        sessionId,
      ),
    );
  } catch (error) {
    return proposalError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") return invalidInput();
  const projectId = (await params).projectId;
  try {
    if (body.action === "create_proposal") {
      const conversationSessionId = idValue(body.conversationSessionId);
      const productSkill = skillValue(body.productSkill);
      const operation = limitedText(body.operation, 1, 240);
      const rationale = limitedText(body.rationale, 1, 2_000);
      const title = limitedText(body.title, 1, 160);
      const effect = limitedText(body.effect, 1, 2_000);
      const idempotencyKey = idValue(body.idempotencyKey);
      const authorizedMaterialIds = idArray(body.authorizedMaterialIds, 100);
      const warnings = textArray(body.warnings, 20, 500);
      const scopeSectionSlug = optionalSlug(body.scopeSectionSlug);
      const baseVersionId = optionalId(body.baseVersionId);
      const excludedScope = optionalText(body.excludedScope, 1_000);
      if (
        !conversationSessionId ||
        !productSkill ||
        !operation ||
        !rationale ||
        !title ||
        !effect ||
        !idempotencyKey ||
        !authorizedMaterialIds ||
        !warnings ||
        scopeSectionSlug === undefined ||
        baseVersionId === undefined ||
        excludedScope === undefined
      ) {
        return invalidInput();
      }
      const result = await createM5ActionProposalForActor(auth.actor, projectId, {
        conversationSessionId,
        productSkill,
        operation,
        rationale,
        authorizedMaterialIds,
        scopeSectionSlug,
        baseVersionId,
        excludedScope,
        title,
        effect,
        warnings,
        idempotencyKey,
      });
      return apiSuccess(result, result.replayed ? 200 : 201);
    }
    if (body.action === "decide_proposal") {
      const conversationSessionId = idValue(body.conversationSessionId);
      const proposalId = idValue(body.proposalId);
      const idempotencyKey = idValue(body.idempotencyKey);
      const decision =
        body.decision === "CONFIRM" || body.decision === "REJECT"
          ? body.decision
          : null;
      const reason = optionalText(body.reason, 1_000);
      if (
        !conversationSessionId ||
        !proposalId ||
        !idempotencyKey ||
        !decision ||
        reason === undefined
      ) {
        return invalidInput();
      }
      const result = await decideM5ActionProposalForActor(auth.actor, projectId, {
        conversationSessionId,
        proposalId,
        decision,
        reason,
        idempotencyKey,
      });
      return apiSuccess(result);
    }
    if (body.action === "delete_proposal") {
      const conversationSessionId = idValue(body.conversationSessionId);
      const proposalId = idValue(body.proposalId);
      if (!conversationSessionId || !proposalId) return invalidInput();
      return apiSuccess(await deleteM5ActionProposalForActor(auth.actor, projectId, {
        conversationSessionId,
        proposalId,
      }));
    }
    return apiError(400, "INVALID_ACTION", "不支持的操作提案请求。");
  } catch (error) {
    return proposalError(error);
  }
}

function skillValue(value: unknown): M5ProductSkill | null {
  return typeof value === "string" &&
    M5_PRODUCT_SKILLS.includes(value as M5ProductSkill)
    ? (value as M5ProductSkill)
    : null;
}

function idValue(value: unknown): string | null {
  return typeof value === "string" && safeId.test(value.trim())
    ? value.trim()
    : null;
}

function idArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const ids = value.map(idValue);
  return ids.every((id): id is string => Boolean(id))
    ? [...new Set(ids)]
    : null;
}

function textArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const texts = value.map((item) => limitedText(item, 1, maxLength));
  return texts.every((item): item is string => Boolean(item)) ? texts : null;
}

function limitedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return limitedText(value, 1, max) ?? undefined;
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return idValue(value) ?? undefined;
}

function optionalSlug(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const slug = value.trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(slug) ? slug : undefined;
}

function invalidInput(): Response {
  return apiError(400, "INVALID_REQUEST", "操作提案请求字段无效或超出限制。");
}

function proposalError(error: unknown): Response {
  if (error instanceof M5ActionProposalRepositoryError) {
    const status =
      error.code === "PROJECT_NOT_FOUND" ||
      error.code === "CONVERSATION_NOT_FOUND" ||
      error.code === "PROPOSAL_NOT_FOUND"
        ? 404
        : error.code === "DATABASE_WRITE_FAILED"
          ? 500
          : error.code === "PROPOSAL_NOT_DELETABLE"
            ? 409
          : 409;
    return apiError(status, error.code, error.message);
  }
  console.error("M5 action proposal persistence failure", error);
  return apiError(500, "M5_ACTION_PROPOSAL_FAILURE", "操作提案持久化失败。");
}
