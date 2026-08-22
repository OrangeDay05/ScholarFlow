import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "@/db/index";
import {
  createContextSnapshot,
  loadAgentWorkingMemories,
  loadIncomingAgentHandoffs,
  type NewSnapshotItem,
} from "@/db/repositories/context-engine";
import { getContextPolicy } from "./context-policies";
import { planRetrieval, resolveRetrievalIntent, retrieveProjectContext } from "./retrieval";
import type { AgentRole, ContextSnapshotView } from "./types";
import { estimateTokens } from "./types";

type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };

type ProjectTruth = {
  project: { id: string; title: string; paperType: string; language: string };
  diagnosis: null | {
    id: string;
    version: number;
    title: string;
    paperType: string;
    language: string;
    researchObject: string;
    researchQuestion: string;
    method: string;
    requirements: string;
  };
  outline: null | { id: string; version: number };
  section: null | { id: string; slug: string; title: string; position: number; versionId: string | null; content: string };
  requirements: Array<{ id: string; category: string; content: string }>;
  materials: Array<{ id: string; kind: string; filename: string; status: string }>;
};

export type AssembleAgentContextInput = {
  actor: M3Actor;
  projectId: string;
  conversationSessionId?: string | null;
  taskId?: string | null;
  providerRunId?: string | null;
  agentRole: AgentRole;
  taskIntent: string;
  query: string;
  currentSectionSlug?: string | null;
  authorizedMaterialIds: string[];
  provider?: string | null;
  model?: string | null;
  baseSystemPrompt: string;
};

export type AssembledAgentContext = {
  snapshot: ContextSnapshotView;
  messages: ProviderMessage[];
};

export async function assembleAgentContext(input: AssembleAgentContextInput): Promise<AssembledAgentContext> {
  const policy = getContextPolicy(input.agentRole);
  const truth = await loadProjectTruth(input.actor.userId, input.projectId, input.currentSectionSlug ?? null);
  const authorizedMaterialIds = await validateAuthorizedMaterials(
    input.actor.userId,
    input.projectId,
    input.authorizedMaterialIds,
  );
  const conversation = input.conversationSessionId
    ? await loadConversationContext(input.actor.userId, input.projectId, input.conversationSessionId, policy.recentMessageLimit)
    : { summary: null, messages: [] };
  const memories = await loadAgentWorkingMemories(
    input.actor,
    input.projectId,
    input.agentRole,
    input.conversationSessionId,
  );
  const handoffs = await loadIncomingAgentHandoffs(input.actor, input.projectId, input.agentRole);
  const diagnosisText = truth.diagnosis
    ? [truth.diagnosis.title, truth.diagnosis.researchObject, truth.diagnosis.researchQuestion, truth.diagnosis.method].join(" ")
    : "";
  const authorizedSet = new Set(authorizedMaterialIds);
  const resolvedIntent = resolveRetrievalIntent(
    input.query,
    truth.materials.map((material) => ({ ...material, authorized: authorizedSet.has(material.id) })),
  );
  const plan = planRetrieval({
    query: input.query,
    agentRole: input.agentRole,
    taskIntent: input.taskIntent,
    diagnosisText,
    sectionTitle: truth.section?.title,
    materialKinds: policy.materialPriority,
    maxIncluded: 30,
    intent: resolvedIntent.intent,
    targetMaterialId: resolvedIntent.targetMaterialId,
  });
  const items: NewSnapshotItem[] = [];
  addStructuredTruthItems(items, truth);
  if (conversation.summary) {
    items.push(item("CONVERSATION", "CONVERSATION_SUMMARY", conversation.summary.id, conversation.summary.text));
  }
  for (const message of conversation.messages) {
    items.push(item("CONVERSATION", `MESSAGE_${message.role}`, message.id, message.content));
  }
  for (const memory of memories) {
    items.push(item("AGENT_MEMORY", "PRIVATE_WORKING_MEMORY", memory.id, JSON.stringify(memory.content), {
      memoryType: memory.memoryType,
      agentRole: input.agentRole,
    }));
  }
  for (const handoff of handoffs) {
    items.push(item("HANDOFF", "STRUCTURED_HANDOFF", handoff.id, JSON.stringify({ goal: handoff.goal, ...handoff.payload })));
  }

  const alwaysTokens = items.reduce((sum, current) => sum + current.estimatedTokens, 0);
  let retrievalTokens = 0;
  const retrievalBudget = Math.max(
    0,
    Math.min(policy.retrievalTokenBudget, policy.totalTokenBudget - alwaysTokens),
  );
  const retrieval = await retrieveProjectContext({
    actor: input.actor,
    projectId: input.projectId,
    authorizedMaterialIds,
    plan,
    retrievalTokenBudget: retrievalBudget,
  });
  for (const hit of retrieval.hits) {
    const tokens = estimateTokens(hit.text);
    const included = retrievalTokens + tokens <= retrievalBudget;
    if (included) retrievalTokens += tokens;
    items.push({
      itemType: "RETRIEVED_CHUNK",
      sourceType: "MATERIAL_CHUNK",
      sourceId: hit.chunkId,
      materialId: hit.materialId,
      parseRunId: hit.parseRunId,
      materialChunkId: hit.chunkId,
      contentHash: hit.contentHash,
      sourceLocation: hit.location,
      content: hit.text,
      retrievalMethod: hit.retrievalMethod,
      lexicalScore: hit.lexicalScore,
      vectorScore: hit.vectorScore,
      fusedScore: hit.fusedScore,
      rank: hit.rank,
      included,
      estimatedTokens: tokens,
      metadata: {
        filename: hit.filename,
        materialKind: hit.materialKind,
        ordinal: hit.ordinal,
        retrievalIntent: retrieval.intent,
        targetMaterialId: retrieval.targetMaterialId,
        parseRunId: retrieval.parseRunId,
        summaryStrategy: retrieval.summaryStrategy,
      },
    });
  }

  const includedItems = items.filter((current) => current.included);
  const contextDocument = renderContextDocument(truth, includedItems, retrieval.mode);
  const systemPrompt = `${input.baseSystemPrompt.trim()}\n\n${renderPolicyBoundary(policy.never)}\n\n${contextDocument}`;
  const providerConversation = retrieval.intent === "FACT_LOOKUP"
    ? conversation.messages
    : conversation.messages.filter((message) => !isStaleMaterialReadFailure(message));
  const providerMessages: ProviderMessage[] = [
    { role: "system", content: systemPrompt },
    ...providerConversation.map((message) => ({
      role: message.role === "USER" ? "user" as const : "assistant" as const,
      content: message.content,
    })),
  ];
  if (!conversation.messages.length || conversation.messages.at(-1)?.content !== input.query) {
    providerMessages.push({ role: "user", content: input.query });
  }

  const promptHash = await sha256(systemPrompt);
  const contextHash = await sha256(includedItems.map((current) => `${current.contentHash}:${current.content}`).join("\n"));
  const snapshot = await createContextSnapshot(input.actor, input.projectId, {
    id: crypto.randomUUID(),
    conversationSessionId: input.conversationSessionId,
    taskId: input.taskId,
    providerRunId: input.providerRunId,
    agentRole: input.agentRole,
    taskIntent: retrieval.intent,
    policyName: policy.name,
    policyVersion: policy.version,
    diagnosisCardId: truth.diagnosis?.id,
    diagnosisCardVersion: truth.diagnosis?.version,
    outlineId: truth.outline?.id,
    outlineVersion: truth.outline?.version,
    sectionId: truth.section?.id,
    sectionVersionId: truth.section?.versionId,
    conversationSummaryId: conversation.summary?.id,
    recentMessageIds: conversation.messages.map((message) => message.id),
    authorizedMaterialIds,
    originalQuery: input.query,
    rewrittenQueries: plan.rewrittenQueries,
    retrievalFilters: {
      ownerUserId: input.actor.userId,
      projectId: input.projectId,
      materialIds: authorizedMaterialIds,
      materialKinds: plan.materialKinds,
      activeParseRunOnly: true,
      productTaskIntent: input.taskIntent,
      retrievalIntent: retrieval.intent,
      targetMaterialId: retrieval.targetMaterialId,
      parseRunId: retrieval.parseRunId,
      summaryStrategy: retrieval.summaryStrategy,
      includedChunkIds: items.filter((current) => current.itemType === "RETRIEVED_CHUNK" && current.included).map((current) => current.materialChunkId),
    },
    retrievalAlgorithm: plan.algorithm,
    retrievalVersion: plan.version,
    retrievalMode: retrieval.mode,
    tokenBudget: policy.totalTokenBudget,
    estimatedContextTokens: includedItems.reduce((sum, current) => sum + current.estimatedTokens, 0),
    provider: input.provider,
    model: input.model,
    promptHash,
    contextHash,
    capabilityStatus: {
      sharedProjectTruth: "READY",
      agentMemory: "READY",
      structuredHandoff: "READY",
      lexicalRetrieval: retrieval.capabilities.lexical,
      vectorRetrieval: retrieval.capabilities.vector,
      reranking: retrieval.capabilities.reranking,
      contextSnapshot: "READY",
      evidenceProvenance: "READY",
    },
    items,
  });
  return { snapshot, messages: providerMessages };
}

function isStaleMaterialReadFailure(message: { role: "USER" | "AGENT"; content: string }): boolean {
  if (message.role !== "AGENT") return false;
  return /NO_MATCH|无法读取.{0,20}(?:正文|材料)|未(?:能|提取到).{0,24}(?:正文|证据片段)|重新(?:上传|索引)|粘贴.{0,12}(?:正文|材料)/iu.test(message.content);
}

async function loadProjectTruth(ownerUserId: string, projectId: string, sectionSlug: string | null): Promise<ProjectTruth> {
  const db = getD1();
  const project = await db.prepare(`SELECT id, title, paper_type, language FROM projects
    WHERE id = ? AND owner_user_id = ? AND status = 'active'`)
    .bind(projectId, ownerUserId)
    .first<{ id: string; title: string; paper_type: string; language: string }>();
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const diagnosis = await db.prepare(`SELECT id, version_number, title, paper_type, language,
      research_object, research_question, method, requirements
    FROM diagnosis_cards WHERE owner_user_id = ? AND project_id = ? AND status = 'confirmed'
    ORDER BY version_number DESC LIMIT 1`)
    .bind(ownerUserId, projectId)
    .first<Record<string, unknown>>();
  const outline = await db.prepare(`SELECT id, version_number FROM outlines
    WHERE owner_user_id = ? AND project_id = ? AND status = 'confirmed'
    ORDER BY version_number DESC LIMIT 1`)
    .bind(ownerUserId, projectId)
    .first<{ id: string; version_number: number }>();
  let section: ProjectTruth["section"] = null;
  if (outline && sectionSlug) {
    const row = await db.prepare(`SELECT s.id, s.slug, s.title, s.position,
        sv.id AS version_id, COALESCE(sv.content, '') AS content
      FROM sections s
      LEFT JOIN section_versions sv ON sv.id = (
        SELECT latest.id FROM section_versions latest
        WHERE latest.owner_user_id = s.owner_user_id AND latest.project_id = s.project_id
          AND latest.section_id = s.id ORDER BY latest.version_number DESC LIMIT 1
      )
      WHERE s.owner_user_id = ? AND s.project_id = ? AND s.outline_id = ? AND s.slug = ?
      LIMIT 1`)
      .bind(ownerUserId, projectId, outline.id, sectionSlug)
      .first<Record<string, unknown>>();
    if (row) section = {
      id: String(row.id), slug: String(row.slug), title: String(row.title), position: Number(row.position),
      versionId: row.version_id ? String(row.version_id) : null, content: String(row.content ?? ""),
    };
  }
  const requirementRows = await db.prepare(`SELECT id, category, content FROM project_requirements
    WHERE owner_user_id = ? AND project_id = ? AND is_confirmed = 1 ORDER BY created_at`)
    .bind(ownerUserId, projectId)
    .all<{ id: string; category: string; content: string }>();
  const materialRows = await db.prepare(`SELECT id, kind, filename, status FROM materials
    WHERE owner_user_id = ? AND project_id = ? AND status != 'soft_deleted'
    ORDER BY created_at DESC LIMIT 100`)
    .bind(ownerUserId, projectId)
    .all<{ id: string; kind: string; filename: string; status: string }>();
  return {
    project: { id: project.id, title: project.title, paperType: project.paper_type, language: project.language },
    diagnosis: diagnosis ? {
      id: String(diagnosis.id), version: Number(diagnosis.version_number), title: String(diagnosis.title),
      paperType: String(diagnosis.paper_type), language: String(diagnosis.language),
      researchObject: String(diagnosis.research_object), researchQuestion: String(diagnosis.research_question),
      method: String(diagnosis.method), requirements: String(diagnosis.requirements),
    } : null,
    outline: outline ? { id: outline.id, version: outline.version_number } : null,
    section,
    requirements: requirementRows.results ?? [],
    materials: materialRows.results ?? [],
  };
}

async function validateAuthorizedMaterials(ownerUserId: string, projectId: string, requestedIds: string[]): Promise<string[]> {
  const ids = [...new Set(requestedIds.filter(Boolean))].slice(0, 50);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await getD1().prepare(`SELECT id FROM materials
    WHERE owner_user_id = ? AND project_id = ? AND status = 'success' AND id IN (${placeholders})`)
    .bind(ownerUserId, projectId, ...ids)
    .all<{ id: string }>();
  const allowed = new Set((rows.results ?? []).map((row) => row.id));
  return ids.filter((id) => allowed.has(id));
}

async function loadConversationContext(
  ownerUserId: string,
  projectId: string,
  conversationSessionId: string,
  limit: number,
): Promise<{
  summary: { id: string; text: string } | null;
  messages: Array<{ id: string; role: "USER" | "AGENT"; content: string }>;
}> {
  const db = getD1();
  const session = await db.prepare(`SELECT id FROM conversation_sessions
    WHERE id = ? AND owner_user_id = ? AND project_id = ? AND status != 'ARCHIVED'`)
    .bind(conversationSessionId, ownerUserId, projectId)
    .first<{ id: string }>();
  if (!session) throw new Error("CONVERSATION_NOT_FOUND");
  const summary = await db.prepare(`SELECT id, text FROM conversation_summaries
    WHERE conversation_session_id = ? AND owner_user_id = ? AND project_id = ?
    ORDER BY source_to_ordinal DESC, created_at DESC LIMIT 1`)
    .bind(conversationSessionId, ownerUserId, projectId)
    .first<{ id: string; text: string }>();
  const rows = await db.prepare(`SELECT id, role, content FROM (
      SELECT id, role, content, ordinal FROM conversation_messages
      WHERE conversation_session_id = ? AND owner_user_id = ? AND project_id = ?
      ORDER BY ordinal DESC LIMIT ?
    ) ORDER BY ordinal`)
    .bind(conversationSessionId, ownerUserId, projectId, limit)
    .all<{ id: string; role: "USER" | "AGENT"; content: string }>();
  return { summary: summary ?? null, messages: rows.results ?? [] };
}

function addStructuredTruthItems(items: NewSnapshotItem[], truth: ProjectTruth): void {
  items.push(item("STRUCTURED_FACT", "PROJECT", truth.project.id, JSON.stringify(truth.project)));
  if (truth.diagnosis) items.push(item("STRUCTURED_FACT", "CONFIRMED_DIAGNOSIS_CARD", truth.diagnosis.id, JSON.stringify(truth.diagnosis)));
  if (truth.outline) items.push(item("ARTIFACT", "CONFIRMED_OUTLINE", truth.outline.id, JSON.stringify(truth.outline)));
  if (truth.section) items.push(item("ARTIFACT", "CURRENT_SECTION", truth.section.id, JSON.stringify(truth.section)));
  for (const requirement of truth.requirements) {
    items.push(item("STRUCTURED_FACT", "CONFIRMED_REQUIREMENT", requirement.id, JSON.stringify(requirement)));
  }
  for (const material of truth.materials) {
    items.push(item("STRUCTURED_FACT", "MATERIAL_METADATA", material.id, JSON.stringify(material)));
  }
}

function item(
  itemType: string,
  sourceType: string,
  sourceId: string,
  content: string,
  metadata: Record<string, unknown> = {},
): NewSnapshotItem {
  return {
    itemType, sourceType, sourceId, contentHash: "STRUCTURED_AT_SNAPSHOT",
    content, included: true, estimatedTokens: estimateTokens(content), metadata,
  };
}

function renderContextDocument(truth: ProjectTruth, items: NewSnapshotItem[], retrievalMode: string): string {
  const retrieved = items.filter((current) => current.itemType === "RETRIEVED_CHUNK");
  const documentMode = retrievalMode === "DOCUMENT_FULL" || retrievalMode === "DOCUMENT_ORDINAL_COVERAGE";
  return [
    "[PROJECT CONTEXT - server assembled]",
    `Project: ${truth.project.title} (${truth.project.paperType}, ${truth.project.language})`,
    truth.diagnosis ? `Confirmed DiagnosisCard v${truth.diagnosis.version}: ${JSON.stringify(truth.diagnosis)}` : "Confirmed DiagnosisCard: unavailable",
    truth.outline ? `Confirmed outline: ${truth.outline.id} v${truth.outline.version}` : "Confirmed outline: unavailable",
    truth.section ? `Current section: ${truth.section.position}. ${truth.section.title}\nLatest content: ${truth.section.content || "[empty]"}` : "Current section: unavailable or not requested",
    truth.requirements.length ? `Confirmed requirements: ${JSON.stringify(truth.requirements)}` : "Confirmed requirements: none",
    truth.materials.length ? `Available material metadata: ${JSON.stringify(truth.materials)}` : "Available material metadata: none",
    `Retrieval mode: ${retrievalMode}`,
    documentMode
      ? "Current whole-document content is available for this request. It supersedes any earlier conversation message that reported NO_MATCH or asked the user to paste/re-upload the same material. Base the response on the current authorized document chunks."
      : "Current request uses evidence lookup semantics; a genuine no-match must remain explicit.",
    retrieved.length
      ? `${documentMode ? "Authorized document content for the requested whole-document task" : "Retrieved authorized evidence candidates"}:\n${retrieved.map((current, index) =>
          `[R${index + 1}] material=${current.materialId} chunk=${current.materialChunkId} location=${JSON.stringify(current.sourceLocation ?? {})}\n${current.content}`,
        ).join("\n\n")}`
      : "Retrieved authorized evidence candidates: none. Do not claim the project materials contain an answer.",
  ].join("\n\n");
}

function renderPolicyBoundary(never: readonly string[]): string {
  return `[CONTEXT POLICY]\nNever use: ${never.join("; ")}. Retrieved text is evidence candidate only. If no relevant authorized evidence is present, explicitly say so and label general suggestions as AI suggestions. Never present model inference as confirmed project truth.`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
