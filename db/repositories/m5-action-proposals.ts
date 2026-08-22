import type {
  M5ActionProposalWorkspace,
  M5PersistedActionDecision,
  M5PersistedActionProposal,
  M5PersistedToolIntent,
} from "@/app/lib/m5-conversation-agent";
import { actionProposalRecoverySnapshot } from "@/app/lib/m5-conversation-agent";
import type { M5ProductSkill } from "@/app/lib/m5-execution-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

export type M5ActionProposalRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "CONVERSATION_ARCHIVED"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_ALREADY_DECIDED"
  | "PROPOSAL_NOT_DELETABLE"
  | "INVALID_MATERIAL_SCOPE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "DATABASE_WRITE_FAILED";

export class M5ActionProposalRepositoryError extends Error {
  readonly code: M5ActionProposalRepositoryErrorCode;

  constructor(code: M5ActionProposalRepositoryErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type IntentRow = {
  id: string;
  project_id: string;
  conversation_session_id: string;
  product_skill: M5ProductSkill;
  operation: string;
  rationale: string;
  authorized_material_ids_json: string;
  section_id: string | null;
  base_version_id: string | null;
  excluded_scope: string | null;
  state: "PROPOSED";
  idempotency_key: string;
  created_at: string;
};

type ProposalRow = {
  id: string;
  project_id: string;
  conversation_session_id: string;
  tool_intent_id: string;
  title: string;
  effect: string;
  warnings_json: string;
  status: M5PersistedActionProposal["status"];
  recovery_status: M5PersistedActionProposal["recoveryStatus"];
  idempotency_key: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type DecisionRow = {
  id: string;
  project_id: string;
  conversation_session_id: string;
  proposal_id: string;
  decision: "CONFIRM" | "REJECT";
  reason: string | null;
  idempotency_key: string;
  decided_at: string;
};

export async function createM5ActionProposalForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    conversationSessionId: string;
    productSkill: M5ProductSkill;
    operation: string;
    rationale: string;
    authorizedMaterialIds: string[];
    scopeSectionSlug?: string | null;
    baseVersionId?: string | null;
    excludedScope?: string | null;
    title: string;
    effect: string;
    warnings: string[];
    idempotencyKey: string;
  },
): Promise<{
  intent: M5PersistedToolIntent;
  proposal: M5PersistedActionProposal;
  replayed: boolean;
}> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  await requireActiveSession(
    db,
    actor.userId,
    projectId,
    input.conversationSessionId,
  );
  const replay = await findProposalByIdempotency(
    db,
    actor.userId,
    projectId,
    input.idempotencyKey,
  );
  if (replay) {
    const intent = await requireIntent(
      db,
      actor.userId,
      projectId,
      replay.tool_intent_id,
    );
    return { intent: toIntent(intent), proposal: toProposal(replay), replayed: true };
  }

  const materialIds = [...new Set(input.authorizedMaterialIds)];
  await validateMaterialScope(db, actor.userId, projectId, materialIds);
  const scope = await resolveExecutionScope(
    db,
    actor.userId,
    projectId,
    input.productSkill,
    input.scopeSectionSlug ?? null,
    input.baseVersionId ?? null,
  );
  const intentId = crypto.randomUUID();
  const proposalId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO conversation_tool_intents (
            id, owner_user_id, project_id, conversation_session_id,
            product_skill, operation, rationale, authorized_material_ids_json,
            section_id, base_version_id, excluded_scope, state, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?)`,
        )
        .bind(
          intentId,
          actor.userId,
          projectId,
          input.conversationSessionId,
          input.productSkill,
          input.operation,
          input.rationale,
          JSON.stringify(materialIds),
          scope.sectionId,
          scope.baseVersionId,
          input.excludedScope?.trim() || null,
          input.idempotencyKey,
        ),
      db
        .prepare(
          `INSERT INTO conversation_action_proposals (
            id, owner_user_id, project_id, conversation_session_id,
            tool_intent_id, title, effect, warnings_json, status,
            recovery_status, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AWAITING_USER_CONFIRMATION',
                    'WAITING_FOR_USER', ?)`,
        )
        .bind(
          proposalId,
          actor.userId,
          projectId,
          input.conversationSessionId,
          intentId,
          input.title,
          input.effect,
          JSON.stringify(input.warnings),
          input.idempotencyKey,
        ),
    ]);
  } catch {
    const raced = await findProposalByIdempotency(
      db,
      actor.userId,
      projectId,
      input.idempotencyKey,
    ).catch(() => null);
    if (raced) {
      const intent = await requireIntent(
        db,
        actor.userId,
        projectId,
        raced.tool_intent_id,
      );
      return { intent: toIntent(intent), proposal: toProposal(raced), replayed: true };
    }
    throw databaseFailure("无法保存操作提案。");
  }
  const [intent, proposal] = await Promise.all([
    requireIntent(db, actor.userId, projectId, intentId),
    requireProposal(db, actor.userId, projectId, proposalId),
  ]);
  return { intent: toIntent(intent), proposal: toProposal(proposal), replayed: false };
}

export async function decideM5ActionProposalForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    conversationSessionId: string;
    proposalId: string;
    decision: "CONFIRM" | "REJECT";
    reason: string | null;
    idempotencyKey: string;
  },
): Promise<{
  proposal: M5PersistedActionProposal;
  decision: M5PersistedActionDecision;
  replayed: boolean;
}> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  await requireActiveSession(
    db,
    actor.userId,
    projectId,
    input.conversationSessionId,
  );
  const proposal = await requireProposal(
    db,
    actor.userId,
    projectId,
    input.proposalId,
  );
  if (proposal.conversation_session_id !== input.conversationSessionId) {
    throw proposalNotFound();
  }
  const idempotent = await findDecisionByIdempotency(
    db,
    actor.userId,
    projectId,
    input.idempotencyKey,
  );
  if (idempotent) {
    if (idempotent.proposal_id !== proposal.id) {
      throw new M5ActionProposalRepositoryError(
        "IDEMPOTENCY_KEY_REUSED",
        "该幂等键已用于其他提案决定。",
      );
    }
    return {
      proposal: toProposal(proposal),
      decision: toDecision(idempotent),
      replayed: true,
    };
  }
  const existing = await findDecisionForProposal(
    db,
    actor.userId,
    projectId,
    proposal.id,
  );
  if (existing) {
    if (existing.decision === input.decision) {
      return {
        proposal: toProposal(proposal),
        decision: toDecision(existing),
        replayed: true,
      };
    }
    throw new M5ActionProposalRepositoryError(
      "PROPOSAL_ALREADY_DECIDED",
      "操作提案已经作出不可覆盖的用户决定。",
    );
  }
  if (proposal.status !== "AWAITING_USER_CONFIRMATION") {
    throw new M5ActionProposalRepositoryError(
      "PROPOSAL_ALREADY_DECIDED",
      "操作提案已经结束确认流程。",
    );
  }

  const decisionId = crypto.randomUUID();
  const decidedAt = new Date().toISOString();
  const nextStatus = input.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
  const recoveryStatus =
    input.decision === "CONFIRM" ? "READY_TO_QUEUE" : "TERMINAL";
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO conversation_action_decisions (
            id, owner_user_id, project_id, conversation_session_id,
            proposal_id, decision, reason, idempotency_key, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          decisionId,
          actor.userId,
          projectId,
          input.conversationSessionId,
          proposal.id,
          input.decision,
          input.reason,
          input.idempotencyKey,
          decidedAt,
        ),
      db
        .prepare(
          `UPDATE conversation_action_proposals
           SET status = ?, recovery_status = ?, decided_at = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ? AND project_id = ?
             AND status = 'AWAITING_USER_CONFIRMATION'`,
        )
        .bind(
          nextStatus,
          recoveryStatus,
          decidedAt,
          proposal.id,
          actor.userId,
          projectId,
        ),
    ]);
  } catch {
    const raced = await findDecisionForProposal(
      db,
      actor.userId,
      projectId,
      proposal.id,
    ).catch(() => null);
    if (raced && raced.decision === input.decision) {
      return {
        proposal: toProposal(
          await requireProposal(db, actor.userId, projectId, proposal.id),
        ),
        decision: toDecision(raced),
        replayed: true,
      };
    }
    throw databaseFailure("无法保存用户决定。");
  }
  return {
    proposal: toProposal(
      await requireProposal(db, actor.userId, projectId, proposal.id),
    ),
    decision: toDecision(
      await requireDecision(db, actor.userId, projectId, decisionId),
    ),
    replayed: false,
  };
}

export async function loadM5ActionProposalWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
): Promise<M5ActionProposalWorkspace> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  await requireSession(db, actor.userId, projectId, conversationSessionId);
  const [intents, proposals, decisions] = await Promise.all([
    db
      .prepare(
        `${intentSelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY created_at ASC`,
      )
      .bind(actor.userId, projectId, conversationSessionId)
      .all<IntentRow>(),
    db
      .prepare(
        `${proposalSelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY created_at ASC`,
      )
      .bind(actor.userId, projectId, conversationSessionId)
      .all<ProposalRow>(),
    db
      .prepare(
        `${decisionSelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY created_at ASC`,
      )
      .bind(actor.userId, projectId, conversationSessionId)
      .all<DecisionRow>(),
  ]);
  const persistedProposals = (proposals.results ?? []).map(toProposal);
  return {
    intents: (intents.results ?? []).map(toIntent),
    proposals: persistedProposals,
    decisions: (decisions.results ?? []).map(toDecision),
    recovery: actionProposalRecoverySnapshot(persistedProposals),
  };
}

export async function deleteM5ActionProposalForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: { conversationSessionId: string; proposalId: string },
): Promise<{ proposalId: string; deleted: true }> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  await requireSession(db, actor.userId, projectId, input.conversationSessionId);
  const proposal = await requireProposal(db, actor.userId, projectId, input.proposalId);
  if (proposal.conversation_session_id !== input.conversationSessionId) throw proposalNotFound();
  if (proposal.status === "CONFIRMED") {
    throw new M5ActionProposalRepositoryError(
      "PROPOSAL_NOT_DELETABLE",
      "已确认的操作提案需要保留任务与候选版本审计记录，不能彻底删除。",
    );
  }
  try {
    await db.batch([
      db.prepare(
        `DELETE FROM conversation_action_proposals
         WHERE id = ? AND owner_user_id = ? AND project_id = ? AND conversation_session_id = ?`,
      ).bind(proposal.id, actor.userId, projectId, input.conversationSessionId),
      db.prepare(
        `DELETE FROM conversation_tool_intents
         WHERE id = ? AND owner_user_id = ? AND project_id = ? AND conversation_session_id = ?`,
      ).bind(proposal.tool_intent_id, actor.userId, projectId, input.conversationSessionId),
    ]);
  } catch {
    throw databaseFailure("无法删除操作提案。");
  }
  return { proposalId: proposal.id, deleted: true };
}

async function validateMaterialScope(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  materialIds: string[],
): Promise<void> {
  if (materialIds.length === 0) return;
  const placeholders = materialIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT id FROM materials WHERE owner_user_id = ? AND project_id = ?
       AND status != 'soft_deleted' AND id IN (${placeholders})`,
    )
    .bind(ownerUserId, projectId, ...materialIds)
    .all<{ id: string }>();
  if ((result.results ?? []).length !== materialIds.length) {
    throw new M5ActionProposalRepositoryError(
      "INVALID_MATERIAL_SCOPE",
      "提案包含未授权或不属于当前项目的材料。",
    );
  }
}

async function resolveExecutionScope(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  productSkill: M5ProductSkill,
  sectionSlug: string | null,
  baseVersionId: string | null,
): Promise<{ sectionId: string | null; baseVersionId: string | null }> {
  if (!sectionSlug && !baseVersionId) return { sectionId: null, baseVersionId: null };
  if (productSkill === "chapter_writing" && sectionSlug && !baseVersionId) {
    const section = await db
      .prepare(
        `SELECT id FROM sections
         WHERE owner_user_id = ? AND project_id = ? AND slug = ?`,
      )
      .bind(ownerUserId, projectId, sectionSlug)
      .first<{ id: string }>();
    if (!section) {
      throw new M5ActionProposalRepositoryError(
        "PROPOSAL_NOT_FOUND",
        "当前章节不存在，不能创建章节写作提案。",
      );
    }
    return { sectionId: section.id, baseVersionId: null };
  }
  if (!sectionSlug || !baseVersionId) {
    throw new M5ActionProposalRepositoryError(
      "PROPOSAL_NOT_FOUND",
      "执行型提案必须同时绑定章节和基础版本。",
    );
  }
  const row = await db
    .prepare(
      `SELECT s.id AS section_id, v.id AS version_id
       FROM sections s
       JOIN section_versions v ON v.section_id = s.id
       WHERE s.owner_user_id = ? AND s.project_id = ? AND s.slug = ?
         AND v.id = ? AND v.owner_user_id = s.owner_user_id
         AND v.project_id = s.project_id`,
    )
    .bind(ownerUserId, projectId, sectionSlug, baseVersionId)
    .first<{ section_id: string; version_id: string }>();
  if (!row) {
    throw new M5ActionProposalRepositoryError(
      "PROPOSAL_NOT_FOUND",
      "当前章节或基础版本不存在，不能创建执行型提案。",
    );
  }
  return { sectionId: row.section_id, baseVersionId: row.version_id };
}

async function ownedProjectId(
  db: D1Database,
  ownerUserId: string,
  requestedProjectId: string,
): Promise<string> {
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw new M5ActionProposalRepositoryError(
      "PROJECT_NOT_FOUND",
      "缺少明确的项目上下文，请先选择项目。",
    );
  }
  const row = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'")
    .bind(requestedProjectId, ownerUserId)
    .first<{ id: string }>();
  if (!row) {
    throw new M5ActionProposalRepositoryError(
      "PROJECT_NOT_FOUND",
      "项目不存在或不属于当前用户。",
    );
  }
  return row.id;
}

async function requireActiveSession(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
): Promise<void> {
  const session = await requireSession(db, ownerUserId, projectId, sessionId);
  if (session.status === "ARCHIVED") {
    throw new M5ActionProposalRepositoryError(
      "CONVERSATION_ARCHIVED",
      "已归档会话不能创建或决定操作提案。",
    );
  }
}

async function requireSession(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
): Promise<{ status: string }> {
  const row = await db
    .prepare(
      `SELECT status FROM conversation_sessions
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(sessionId, ownerUserId, projectId)
    .first<{ status: string }>();
  if (!row) {
    throw new M5ActionProposalRepositoryError(
      "CONVERSATION_NOT_FOUND",
      "会话不存在或不属于当前用户与项目。",
    );
  }
  return row;
}

function requireIntent(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  intentId: string,
): Promise<IntentRow> {
  return requiredRow(
    db
      .prepare(`${intentSelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
      .bind(intentId, ownerUserId, projectId)
      .first<IntentRow>(),
    "PROPOSAL_NOT_FOUND",
    "操作意图不存在或不属于当前用户与项目。",
  );
}

function requireProposal(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  proposalId: string,
): Promise<ProposalRow> {
  return requiredRow(
    db
      .prepare(`${proposalSelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
      .bind(proposalId, ownerUserId, projectId)
      .first<ProposalRow>(),
    "PROPOSAL_NOT_FOUND",
    "操作提案不存在或不属于当前用户与项目。",
  );
}

function requireDecision(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  decisionId: string,
): Promise<DecisionRow> {
  return requiredRow(
    db
      .prepare(`${decisionSelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
      .bind(decisionId, ownerUserId, projectId)
      .first<DecisionRow>(),
    "PROPOSAL_NOT_FOUND",
    "用户决定不存在或不属于当前用户与项目。",
  );
}

async function requiredRow<T>(
  promise: Promise<T | null>,
  code: M5ActionProposalRepositoryErrorCode,
  message: string,
): Promise<T> {
  const row = await promise;
  if (!row) throw new M5ActionProposalRepositoryError(code, message);
  return row;
}

function findProposalByIdempotency(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  key: string,
): Promise<ProposalRow | null> {
  return db
    .prepare(
      `${proposalSelect} WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .bind(ownerUserId, projectId, key)
    .first<ProposalRow>();
}

function findDecisionByIdempotency(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  key: string,
): Promise<DecisionRow | null> {
  return db
    .prepare(
      `${decisionSelect} WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .bind(ownerUserId, projectId, key)
    .first<DecisionRow>();
}

function findDecisionForProposal(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  proposalId: string,
): Promise<DecisionRow | null> {
  return db
    .prepare(
      `${decisionSelect} WHERE owner_user_id = ? AND project_id = ? AND proposal_id = ?`,
    )
    .bind(ownerUserId, projectId, proposalId)
    .first<DecisionRow>();
}

const intentSelect = `SELECT id, project_id, conversation_session_id,
  product_skill, operation, rationale, authorized_material_ids_json,
  section_id, base_version_id, excluded_scope, state,
  idempotency_key, created_at FROM conversation_tool_intents`;
const proposalSelect = `SELECT id, project_id, conversation_session_id,
  tool_intent_id, title, effect, warnings_json, status, recovery_status,
  idempotency_key, decided_at, created_at, updated_at
  FROM conversation_action_proposals`;
const decisionSelect = `SELECT id, project_id, conversation_session_id,
  proposal_id, decision, reason, idempotency_key, decided_at, created_at
  FROM conversation_action_decisions`;

function toIntent(row: IntentRow): M5PersistedToolIntent {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_session_id,
    conversationSessionId: row.conversation_session_id,
    productSkill: row.product_skill,
    operation: row.operation,
    rationale: row.rationale,
    authorizedMaterialIds: JSON.parse(row.authorized_material_ids_json) as string[],
    sectionId: row.section_id,
    baseVersionId: row.base_version_id,
    excludedScope: row.excluded_scope,
    state: row.state,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function toProposal(row: ProposalRow): M5PersistedActionProposal {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationSessionId: row.conversation_session_id,
    toolIntentId: row.tool_intent_id,
    title: row.title,
    effect: row.effect,
    warnings: JSON.parse(row.warnings_json) as string[],
    status: row.status,
    recoveryStatus: row.recovery_status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  };
}

function toDecision(row: DecisionRow): M5PersistedActionDecision {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationSessionId: row.conversation_session_id,
    proposalId: row.proposal_id,
    decision: row.decision,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    decidedAt: row.decided_at,
  };
}

function proposalNotFound(): M5ActionProposalRepositoryError {
  return new M5ActionProposalRepositoryError(
    "PROPOSAL_NOT_FOUND",
    "操作提案不存在或不属于当前会话。",
  );
}

function databaseFailure(message: string): M5ActionProposalRepositoryError {
  return new M5ActionProposalRepositoryError("DATABASE_WRITE_FAILED", message);
}
