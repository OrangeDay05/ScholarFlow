import type { M3Actor } from "@/app/lib/m3-server-identity";
import type {
  AgentRole,
  ContextSnapshotItemView,
  ContextSnapshotView,
} from "@/app/lib/context-engine/types";
import { getD1 } from "../index";

export type NewSnapshotItem = {
  itemType: string;
  sourceType: string;
  sourceId?: string | null;
  materialId?: string | null;
  parseRunId?: string | null;
  materialChunkId?: string | null;
  contentHash: string;
  sourceLocation?: Record<string, unknown>;
  content: string;
  retrievalMethod?: string | null;
  lexicalScore?: number | null;
  vectorScore?: number | null;
  fusedScore?: number | null;
  rerankScore?: number | null;
  rank?: number | null;
  included: boolean;
  estimatedTokens: number;
  metadata?: Record<string, unknown>;
};

export type NewContextSnapshot = {
  id: string;
  conversationSessionId?: string | null;
  taskId?: string | null;
  providerRunId?: string | null;
  agentRole: AgentRole;
  taskIntent: string;
  policyName: string;
  policyVersion: string;
  diagnosisCardId?: string | null;
  diagnosisCardVersion?: number | null;
  outlineId?: string | null;
  outlineVersion?: number | null;
  sectionId?: string | null;
  sectionVersionId?: string | null;
  conversationSummaryId?: string | null;
  recentMessageIds: string[];
  authorizedMaterialIds: string[];
  originalQuery: string;
  rewrittenQueries: string[];
  retrievalFilters: Record<string, unknown>;
  retrievalAlgorithm: string;
  retrievalVersion: string;
  retrievalMode: string;
  tokenBudget: number;
  estimatedContextTokens: number;
  provider?: string | null;
  model?: string | null;
  promptHash: string;
  contextHash: string;
  capabilityStatus: Record<string, string>;
  items: NewSnapshotItem[];
};

export async function createContextSnapshot(
  actor: M3Actor,
  requestedProjectId: string,
  input: NewContextSnapshot,
): Promise<ContextSnapshotView> {
  const db = getD1();
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  await db.prepare(`INSERT INTO agent_context_snapshots (
    id, owner_user_id, project_id, conversation_session_id, task_id, provider_run_id,
    agent_role, task_intent, policy_name, policy_version, diagnosis_card_id,
    diagnosis_card_version, outline_id, outline_version, section_id, section_version_id,
    conversation_summary_id, recent_message_ids_json, authorized_material_ids_json,
    original_query, rewritten_queries_json, retrieval_filters_json, retrieval_algorithm,
    retrieval_version, retrieval_mode, token_budget, estimated_context_tokens, provider,
    model, prompt_hash, context_hash, capability_status_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      input.id, actor.userId, projectId, input.conversationSessionId ?? null,
      input.taskId ?? null, input.providerRunId ?? null, input.agentRole, input.taskIntent,
      input.policyName, input.policyVersion, input.diagnosisCardId ?? null,
      input.diagnosisCardVersion ?? null, input.outlineId ?? null, input.outlineVersion ?? null,
      input.sectionId ?? null, input.sectionVersionId ?? null, input.conversationSummaryId ?? null,
      JSON.stringify(input.recentMessageIds), JSON.stringify(input.authorizedMaterialIds),
      input.originalQuery, JSON.stringify(input.rewrittenQueries), JSON.stringify(input.retrievalFilters),
      input.retrievalAlgorithm, input.retrievalVersion, input.retrievalMode, input.tokenBudget,
      input.estimatedContextTokens, input.provider ?? null, input.model ?? null, input.promptHash,
      input.contextHash, JSON.stringify(input.capabilityStatus),
    ).run();

  if (input.items.length) {
    await db.batch(input.items.map((item) => db.prepare(`INSERT INTO context_snapshot_items (
      id, snapshot_id, owner_user_id, project_id, item_type, source_type, source_id,
      material_id, parse_run_id, material_chunk_id, content_hash, source_location_json,
      content, retrieval_method, lexical_score, vector_score, fused_score, rerank_score,
      rank, included, estimated_tokens, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), input.id, actor.userId, projectId, item.itemType, item.sourceType,
        item.sourceId ?? null, item.materialId ?? null, item.parseRunId ?? null,
        item.materialChunkId ?? null, item.contentHash, JSON.stringify(item.sourceLocation ?? {}),
        item.content, item.retrievalMethod ?? null, item.lexicalScore ?? null,
        item.vectorScore ?? null, item.fusedScore ?? null, item.rerankScore ?? null,
        item.rank ?? null, item.included ? 1 : 0, item.estimatedTokens,
        JSON.stringify(item.metadata ?? {}),
      )));
  }
  const snapshot = await loadContextSnapshot(actor, projectId, input.id);
  if (!snapshot) throw new Error("CONTEXT_SNAPSHOT_WRITE_FAILED");
  return snapshot;
}

export async function loadContextSnapshot(
  actor: M3Actor,
  requestedProjectId: string,
  snapshotId: string,
): Promise<ContextSnapshotView | null> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  return loadSnapshotRows(actor.userId, projectId, "s.id = ?", [snapshotId]);
}

export async function loadLatestConversationContextSnapshot(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
): Promise<ContextSnapshotView | null> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  return loadSnapshotRows(
    actor.userId,
    projectId,
    "s.conversation_session_id = ?",
    [conversationSessionId],
  );
}

export async function saveAgentWorkingMemory(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    conversationSessionId?: string | null;
    agentRole: AgentRole;
    scopeType: string;
    scopeId?: string | null;
    memoryType: string;
    content: Record<string, unknown>;
    expiresAt?: string | null;
  },
): Promise<string> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const id = crypto.randomUUID();
  await getD1().prepare(`INSERT INTO agent_working_memories (
    id, owner_user_id, project_id, conversation_session_id, agent_role, scope_type,
    scope_id, memory_type, content_json, status, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`)
    .bind(id, actor.userId, projectId, input.conversationSessionId ?? null, input.agentRole,
      input.scopeType, input.scopeId ?? null, input.memoryType, JSON.stringify(input.content),
      input.expiresAt ?? null)
    .run();
  return id;
}

export async function loadAgentWorkingMemories(
  actor: M3Actor,
  requestedProjectId: string,
  agentRole: AgentRole,
  conversationSessionId?: string | null,
): Promise<Array<{ id: string; memoryType: string; content: Record<string, unknown> }>> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const rows = await getD1().prepare(`SELECT id, memory_type, content_json
    FROM agent_working_memories
    WHERE owner_user_id = ? AND project_id = ? AND agent_role = ? AND status = 'ACTIVE'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      AND (conversation_session_id IS NULL OR conversation_session_id = ?)
    ORDER BY created_at DESC LIMIT 10`)
    .bind(actor.userId, projectId, agentRole, conversationSessionId ?? "")
    .all<{ id: string; memory_type: string; content_json: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    memoryType: row.memory_type,
    content: safeJson(row.content_json),
  }));
}

export async function createAgentHandoff(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    conversationSessionId?: string | null;
    fromAgentRole: AgentRole;
    toAgentRole: AgentRole;
    sourceTaskId?: string | null;
    targetTaskId?: string | null;
    goal: string;
    confirmedInputs?: unknown[];
    relevantDecisions?: unknown[];
    openQuestions?: unknown[];
    warnings?: unknown[];
    artifactRefs?: unknown[];
    recommendedMaterialIds?: string[];
  },
): Promise<string> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const id = crypto.randomUUID();
  await getD1().prepare(`INSERT INTO agent_handoffs (
    id, owner_user_id, project_id, conversation_session_id, from_agent_role, to_agent_role,
    source_task_id, target_task_id, goal, confirmed_inputs_json, relevant_decisions_json,
    open_questions_json, warnings_json, artifact_refs_json, recommended_material_ids_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, actor.userId, projectId, input.conversationSessionId ?? null,
      input.fromAgentRole, input.toAgentRole, input.sourceTaskId ?? null, input.targetTaskId ?? null,
      input.goal, JSON.stringify(input.confirmedInputs ?? []),
      JSON.stringify(input.relevantDecisions ?? []), JSON.stringify(input.openQuestions ?? []),
      JSON.stringify(input.warnings ?? []), JSON.stringify(input.artifactRefs ?? []),
      JSON.stringify(input.recommendedMaterialIds ?? []))
    .run();
  return id;
}

export async function loadIncomingAgentHandoffs(
  actor: M3Actor,
  requestedProjectId: string,
  toAgentRole: AgentRole,
): Promise<Array<{ id: string; goal: string; payload: Record<string, unknown> }>> {
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const rows = await getD1().prepare(`SELECT id, goal, confirmed_inputs_json,
      relevant_decisions_json, open_questions_json, warnings_json, artifact_refs_json,
      recommended_material_ids_json, from_agent_role
    FROM agent_handoffs
    WHERE owner_user_id = ? AND project_id = ? AND to_agent_role = ? AND status = 'OPEN'
    ORDER BY created_at DESC LIMIT 10`)
    .bind(actor.userId, projectId, toAgentRole)
    .all<Record<string, string>>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    goal: row.goal,
    payload: {
      fromAgentRole: row.from_agent_role,
      confirmedInputs: safeArray(row.confirmed_inputs_json),
      relevantDecisions: safeArray(row.relevant_decisions_json),
      openQuestions: safeArray(row.open_questions_json),
      warnings: safeArray(row.warnings_json),
      artifactRefs: safeArray(row.artifact_refs_json),
      recommendedMaterialIds: safeArray(row.recommended_material_ids_json),
    },
  }));
}

async function loadSnapshotRows(
  ownerUserId: string,
  projectId: string,
  extraWhere: string,
  binds: string[],
): Promise<ContextSnapshotView | null> {
  const db = getD1();
  const row = await db.prepare(`SELECT s.* FROM agent_context_snapshots s
    WHERE s.owner_user_id = ? AND s.project_id = ? AND ${extraWhere}
    ORDER BY s.created_at DESC, s.id DESC LIMIT 1`)
    .bind(ownerUserId, projectId, ...binds)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const itemRows = await db.prepare(`SELECT i.*, m.filename FROM context_snapshot_items i
    LEFT JOIN materials m ON m.id = i.material_id AND m.owner_user_id = i.owner_user_id
      AND m.project_id = i.project_id
    WHERE i.snapshot_id = ? AND i.owner_user_id = ? AND i.project_id = ?
    ORDER BY i.included DESC, COALESCE(i.rank, 999999), i.created_at, i.id`)
    .bind(String(row.id), ownerUserId, projectId)
    .all<Record<string, unknown>>();
  return {
    id: String(row.id),
    projectId,
    conversationSessionId: nullableString(row.conversation_session_id),
    agentRole: String(row.agent_role) as AgentRole,
    taskIntent: String(row.task_intent),
    policyName: String(row.policy_name),
    policyVersion: String(row.policy_version),
    retrievalMode: String(row.retrieval_mode),
    originalQuery: String(row.original_query),
    rewrittenQueries: safeArray(String(row.rewritten_queries_json)) as string[],
    authorizedMaterialIds: safeArray(String(row.authorized_material_ids_json)) as string[],
    tokenBudget: Number(row.token_budget),
    estimatedContextTokens: Number(row.estimated_context_tokens),
    capabilityStatus: safeJson(String(row.capability_status_json)) as ContextSnapshotView["capabilityStatus"],
    createdAt: String(row.created_at),
    items: (itemRows.results ?? []).map(toItemView),
  };
}

function toItemView(row: Record<string, unknown>): ContextSnapshotItemView {
  return {
    id: String(row.id),
    itemType: String(row.item_type),
    sourceType: String(row.source_type),
    sourceId: nullableString(row.source_id),
    materialId: nullableString(row.material_id),
    materialChunkId: nullableString(row.material_chunk_id),
    filename: nullableString(row.filename),
    content: String(row.content),
    location: safeJson(String(row.source_location_json)),
    retrievalMethod: nullableString(row.retrieval_method),
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    included: Boolean(row.included),
    estimatedTokens: Number(row.estimated_tokens),
  };
}

async function ownedProjectId(ownerUserId: string, requestedProjectId: string): Promise<string> {
  if (!requestedProjectId || requestedProjectId === "demo") throw new Error("PROJECT_CONTEXT_REQUIRED");
  const row = await getD1().prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
  ).bind(requestedProjectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new Error("PROJECT_NOT_FOUND");
  return row.id;
}

function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function safeArray(value: string): unknown[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
