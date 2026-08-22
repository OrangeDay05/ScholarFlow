import { env } from "cloudflare:workers";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "@/db/index";
import { estimateTokens } from "./types";
import type { AgentRole, ContextCapabilityStatus, RetrievalHit, RetrievalIntent, RetrievalPlan } from "./types";

type CandidateRow = {
  chunk_id: string;
  material_id: string;
  filename: string;
  material_kind: string;
  parse_run_id: string;
  ordinal: number;
  text: string;
  content_hash: string;
  location_json: string;
  metadata_json: string;
};

export type RetrievalResult = {
  hits: RetrievalHit[];
  mode: "HYBRID_RRF" | "LEXICAL_ONLY" | "DOCUMENT_FULL" | "DOCUMENT_ORDINAL_COVERAGE" | "NO_AUTHORIZED_MATERIALS" | "NO_MATCH";
  intent: RetrievalIntent;
  targetMaterialId: string | null;
  parseRunId: string | null;
  summaryStrategy: "FULL_DOCUMENT" | "ORDINAL_COVERAGE" | null;
  capabilities: {
    lexical: ContextCapabilityStatus;
    vector: ContextCapabilityStatus;
    reranking: ContextCapabilityStatus;
  };
};

type MaterialScope = { id: string; kind: string; filename: string; status: string; authorized: boolean };

export class ContextRetrievalError extends Error {
  readonly code: "MATERIAL_SELECTION_REQUIRED" | "MATERIAL_NOT_FOUND" | "MATERIAL_NOT_AUTHORIZED" | "MATERIAL_NOT_PARSED" | "NO_ACTIVE_PARSE_RUN" | "EMPTY_DOCUMENT" | "CONTEXT_BUILD_FAILED";

  constructor(code: ContextRetrievalError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function resolveRetrievalIntent(query: string, materials: MaterialScope[]): { intent: RetrievalIntent; targetMaterialId: string | null } {
  const normalized = query.trim().toLowerCase();
  const summaryRequested = /(总结|概括|梳理).*(初稿|全文|整份|文件|文档|文章|论文|proposal)|(?:这篇|这份|这个).*(?:文章|文档|文件|proposal).*(?:主要写了什么|总结|概括)|主要写了什么/u.test(normalized);
  const readRequested = /(?:先|帮我|你先)?.*(?:看看|看一下|读一下|阅读|了解一下).*(?:初稿|文件|文档|文章|论文|proposal|材料)|(?:先|帮我|你先)?.*(?:初稿|文件|文档|文章|论文|proposal|材料).*(?:看看|看一下|读一下|阅读|了解一下)/u.test(normalized);
  if (!summaryRequested && !readRequested) return { intent: "FACT_LOOKUP", targetMaterialId: null };

  const intent: RetrievalIntent = summaryRequested ? "DOCUMENT_SUMMARY" : "DOCUMENT_READ";
  const named = materials.filter((material) => filenameMentioned(normalized, material.filename));
  if (named.length === 1) {
    if (!named[0].authorized) throw new ContextRetrievalError("MATERIAL_NOT_AUTHORIZED", `材料《${named[0].filename}》未在本轮授权范围内。`);
    return { intent, targetMaterialId: named[0].id };
  }
  if (named.length > 1) throw selectionRequired(named);

  const authorized = materials.filter((material) => material.authorized && material.status === "success");
  const manuscriptCue = /(初稿|proposal|论文|文章)/u.test(normalized);
  const candidates = manuscriptCue ? authorized.filter((material) => material.kind === "manuscript") : authorized;
  if (candidates.length === 1) return { intent, targetMaterialId: candidates[0].id };
  if (candidates.length > 1) throw selectionRequired(candidates);
  if (!authorized.length) throw new ContextRetrievalError("MATERIAL_NOT_AUTHORIZED", "本轮没有已授权且解析成功的材料可读取。");
  throw new ContextRetrievalError("MATERIAL_NOT_FOUND", "没有找到与本次全文读取请求相符的材料。");
}

export type VectorQuery = {
  ownerUserId: string;
  projectId: string;
  authorizedMaterialIds: string[];
  activeParseRunIds: string[];
  queries: string[];
  limit: number;
};

export interface VectorRetriever {
  readonly capability: ContextCapabilityStatus;
  retrieve(input: VectorQuery): Promise<RetrievalHit[]>;
}

class ConfigurationRequiredVectorRetriever implements VectorRetriever {
  readonly capability = "CONFIGURATION_REQUIRED" as const;
  async retrieve(): Promise<RetrievalHit[]> {
    return [];
  }
}

export interface EmbeddingProviderAdapter {
  readonly capability: ContextCapabilityStatus;
  readonly provider: string;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

class ConfigurationRequiredEmbeddingProvider implements EmbeddingProviderAdapter {
  readonly capability = "CONFIGURATION_REQUIRED" as const;
  readonly provider = "UNCONFIGURED";
  readonly model = "UNCONFIGURED";
  async embed(): Promise<number[][]> {
    throw new Error("EMBEDDING_CONFIGURATION_REQUIRED");
  }
}

export function getEmbeddingProviderAdapter(): EmbeddingProviderAdapter {
  const runtime = env as unknown as { AI?: unknown };
  if (!runtime.AI) return new ConfigurationRequiredEmbeddingProvider();
  // A binding alone is not enough to choose a model contract safely. Model selection
  // must be explicit before embeddings can be generated or persisted.
  return new ConfigurationRequiredEmbeddingProvider();
}

export function getVectorRetriever(): VectorRetriever {
  const runtime = env as unknown as { MATERIAL_VECTOR_INDEX?: unknown };
  if (!runtime.MATERIAL_VECTOR_INDEX) return new ConfigurationRequiredVectorRetriever();
  // The index binding and embedding model/dimension must be configured together.
  return new ConfigurationRequiredVectorRetriever();
}

export function planRetrieval(input: {
  query: string;
  agentRole: AgentRole;
  taskIntent: string;
  diagnosisText?: string;
  sectionTitle?: string;
  materialKinds: readonly string[];
  maxIncluded: number;
  intent?: RetrievalIntent;
  targetMaterialId?: string | null;
}): RetrievalPlan {
  const normalized = input.query.trim().replace(/\s+/gu, " ");
  const rewritten = [normalized];
  if (input.sectionTitle && !normalized.includes(input.sectionTitle)) {
    rewritten.push(`${input.sectionTitle} ${normalized}`);
  }
  const diagnosisKeywords = tokenize(input.diagnosisText ?? "").slice(0, 5).join(" ");
  if (diagnosisKeywords) rewritten.push(`${normalized} ${diagnosisKeywords}`);
  return {
    intent: input.intent ?? "FACT_LOOKUP",
    targetMaterialId: input.targetMaterialId ?? null,
    originalQuery: normalized,
    rewrittenQueries: [...new Set(rewritten.filter(Boolean))].slice(0, 3),
    materialKinds: [...input.materialKinds],
    maxCandidates: Math.max(input.maxIncluded * 8, 40),
    maxIncluded: input.maxIncluded,
    algorithm: "PROJECT_SCOPED_HYBRID_RRF",
    version: "v1",
  };
}

export async function retrieveProjectContext(input: {
  actor: M3Actor;
  projectId: string;
  authorizedMaterialIds: string[];
  plan: RetrievalPlan;
  retrievalTokenBudget?: number;
}): Promise<RetrievalResult> {
  const materialIds = [...new Set(input.authorizedMaterialIds.filter(Boolean))].slice(0, 50);
  if (!materialIds.length) {
    return emptyResult("NO_AUTHORIZED_MATERIALS", input.plan.intent);
  }
  await assertOwnedProject(input.actor.userId, input.projectId);
  if (input.plan.intent !== "FACT_LOOKUP") {
    if (!input.plan.targetMaterialId || !materialIds.includes(input.plan.targetMaterialId)) {
      throw new ContextRetrievalError("MATERIAL_NOT_AUTHORIZED", "目标材料未在本轮授权范围内。");
    }
    return retrieveDocumentCoverage({
      ownerUserId: input.actor.userId,
      projectId: input.projectId,
      materialId: input.plan.targetMaterialId,
      intent: input.plan.intent,
      tokenBudget: Math.max(1, input.retrievalTokenBudget ?? 5_000),
    });
  }
  const lexicalHits = await lexicalRetrieve({
    ownerUserId: input.actor.userId,
    projectId: input.projectId,
    authorizedMaterialIds: materialIds,
    plan: input.plan,
  });
  const vector = getVectorRetriever();
  const activeParseRunIds = [...new Set(lexicalHits.map((hit) => hit.parseRunId))];
  const vectorHits = vector.capability === "READY"
    ? await vector.retrieve({
        ownerUserId: input.actor.userId,
        projectId: input.projectId,
        authorizedMaterialIds: materialIds,
        activeParseRunIds,
        queries: input.plan.rewrittenQueries,
        limit: input.plan.maxCandidates,
      })
    : [];

  if (vectorHits.length) {
    return {
      hits: reciprocalRankFuse(lexicalHits, vectorHits, input.plan.maxIncluded),
      mode: "HYBRID_RRF",
      intent: input.plan.intent,
      targetMaterialId: null,
      parseRunId: null,
      summaryStrategy: null,
      capabilities: { lexical: "READY", vector: "READY", reranking: "MISSING" },
    };
  }
  return {
    hits: lexicalHits.slice(0, input.plan.maxIncluded).map((hit, index) => ({ ...hit, rank: index + 1 })),
    mode: lexicalHits.length ? "LEXICAL_ONLY" : "NO_MATCH",
    intent: input.plan.intent,
    targetMaterialId: null,
    parseRunId: null,
    summaryStrategy: null,
    capabilities: { lexical: "READY", vector: vector.capability, reranking: "MISSING" },
  };
}

async function retrieveDocumentCoverage(input: {
  ownerUserId: string;
  projectId: string;
  materialId: string;
  intent: Exclude<RetrievalIntent, "FACT_LOOKUP">;
  tokenBudget: number;
}): Promise<RetrievalResult> {
  const db = getD1();
  const material = await db.prepare(`SELECT id, filename, kind, status FROM materials
    WHERE id = ? AND owner_user_id = ? AND project_id = ? LIMIT 1`)
    .bind(input.materialId, input.ownerUserId, input.projectId)
    .first<{ id: string; filename: string; kind: string; status: string }>();
  if (!material) throw new ContextRetrievalError("MATERIAL_NOT_FOUND", "目标材料不存在或不属于当前项目。");
  if (material.status !== "success") throw new ContextRetrievalError("MATERIAL_NOT_PARSED", `材料《${material.filename}》尚未解析成功。`);
  const run = await db.prepare(`SELECT id FROM material_parse_runs
    WHERE owner_user_id = ? AND project_id = ? AND material_id = ? AND status = 'SUCCEEDED'
    ORDER BY created_at DESC, id DESC LIMIT 1`)
    .bind(input.ownerUserId, input.projectId, input.materialId)
    .first<{ id: string }>();
  if (!run) throw new ContextRetrievalError("NO_ACTIVE_PARSE_RUN", `材料《${material.filename}》没有可用的解析版本。`);
  const rows = await db.prepare(`SELECT mc.id AS chunk_id, mc.material_id, m.filename,
      m.kind AS material_kind, mc.parse_run_id, mc.ordinal, mc.text, mc.content_hash,
      mc.location_json, mc.metadata_json
    FROM material_chunks mc
    JOIN materials m ON m.id = mc.material_id
    WHERE mc.owner_user_id = ? AND mc.project_id = ? AND mc.material_id = ? AND mc.parse_run_id = ?
    ORDER BY mc.ordinal ASC`)
    .bind(input.ownerUserId, input.projectId, input.materialId, run.id)
    .all<CandidateRow>();
  const chunks = rows.results ?? [];
  if (!chunks.length) throw new ContextRetrievalError("EMPTY_DOCUMENT", `材料《${material.filename}》解析成功，但没有可读取的正文片段。`);
  const allTokens = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.text), 0);
  const fullDocument = allTokens <= input.tokenBudget;
  const selected = fullDocument ? chunks : ordinalCoverage(chunks, input.tokenBudget);
  if (!selected.length) throw new ContextRetrievalError("CONTEXT_BUILD_FAILED", "当前上下文预算不足以安全读取任何正文片段。");
  return {
    hits: selected.map((row, index) => toHit(row, "LEXICAL", null, null, 1, index + 1)),
    mode: fullDocument ? "DOCUMENT_FULL" : "DOCUMENT_ORDINAL_COVERAGE",
    intent: input.intent,
    targetMaterialId: input.materialId,
    parseRunId: run.id,
    summaryStrategy: fullDocument ? "FULL_DOCUMENT" : "ORDINAL_COVERAGE",
    capabilities: { lexical: "READY", vector: getVectorRetriever().capability, reranking: "MISSING" },
  };
}

function ordinalCoverage(chunks: CandidateRow[], tokenBudget: number): CandidateRow[] {
  const tokenCounts = chunks.map((chunk) => estimateTokens(chunk.text));
  const average = tokenCounts.reduce((sum, value) => sum + value, 0) / Math.max(tokenCounts.length, 1);
  const slots = Math.max(2, Math.min(chunks.length, Math.floor(tokenBudget / Math.max(average, 1))));
  const indexes = new Set<number>();
  for (let slot = 0; slot < slots; slot += 1) {
    indexes.add(Math.round(slot * (chunks.length - 1) / Math.max(slots - 1, 1)));
  }
  let used = 0;
  const selected: CandidateRow[] = [];
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const tokens = tokenCounts[index];
    if (used + tokens > tokenBudget) continue;
    selected.push(chunks[index]);
    used += tokens;
  }
  return selected;
}

function filenameMentioned(query: string, filename: string): boolean {
  const full = filename.toLowerCase();
  const base = full.replace(/\.[^.]+$/u, "");
  return query.includes(full) || (base.length >= 3 && query.includes(base));
}

function selectionRequired(materials: MaterialScope[]): ContextRetrievalError {
  return new ContextRetrievalError(
    "MATERIAL_SELECTION_REQUIRED",
    `当前项目有多份可选材料，请明确要读取哪一份：${materials.map((material) => `《${material.filename}》`).join("、")}。`,
  );
}

async function lexicalRetrieve(input: {
  ownerUserId: string;
  projectId: string;
  authorizedMaterialIds: string[];
  plan: RetrievalPlan;
}): Promise<RetrievalHit[]> {
  const db = getD1();
  const terms = [...new Set(input.plan.rewrittenQueries.flatMap(tokenize))].slice(0, 18);
  if (!terms.length) return [];
  const materialPlaceholders = input.authorizedMaterialIds.map(() => "?").join(",");
  const supportedKinds = input.plan.materialKinds.filter((kind) =>
    ["requirement", "manuscript", "literature", "data", "image", "note"].includes(kind),
  );
  const kindClause = supportedKinds.length
    ? `AND m.kind IN (${supportedKinds.map(() => "?").join(",")})`
    : "";
  const termClause = terms.map(() => "lower(mc.text) LIKE ? ESCAPE '\\'").join(" OR ");
  const rows = await db.prepare(`SELECT mc.id AS chunk_id, mc.material_id, m.filename,
      m.kind AS material_kind, mc.parse_run_id, mc.ordinal, mc.text, mc.content_hash,
      mc.location_json, mc.metadata_json
    FROM material_chunks mc
    JOIN material_parse_runs pr ON pr.id = mc.parse_run_id
    JOIN materials m ON m.id = mc.material_id
    WHERE mc.owner_user_id = ? AND mc.project_id = ?
      AND m.owner_user_id = ? AND m.project_id = ?
      AND mc.material_id IN (${materialPlaceholders})
      ${kindClause}
      AND pr.status = 'SUCCEEDED' AND m.status = 'success'
      AND NOT EXISTS (
        SELECT 1 FROM material_parse_runs newer
        WHERE newer.owner_user_id = pr.owner_user_id AND newer.project_id = pr.project_id
          AND newer.material_id = pr.material_id AND newer.status = 'SUCCEEDED'
          AND (newer.created_at > pr.created_at OR (newer.created_at = pr.created_at AND newer.id > pr.id))
      )
      AND (${termClause})
    LIMIT ?`).bind(
      input.ownerUserId,
      input.projectId,
      input.ownerUserId,
      input.projectId,
      ...input.authorizedMaterialIds,
      ...supportedKinds,
      ...terms.map((term) => `%${escapeLike(term.toLowerCase())}%`),
      input.plan.maxCandidates,
    ).all<CandidateRow>();

  const kindPriority = new Map(input.plan.materialKinds.map((kind, index) => [kind, index]));
  return (rows.results ?? [])
    .map((row) => {
      const lower = row.text.toLowerCase();
      const phraseScore = input.plan.rewrittenQueries.reduce(
        (score, query) => score + (lower.includes(query.toLowerCase()) ? 8 : 0),
        0,
      );
      const termScore = terms.reduce((score, term) => score + countOccurrences(lower, term.toLowerCase()), 0);
      const structuralBoost = Math.max(0, 3 - (kindPriority.get(row.material_kind) ?? 3)) * 0.25;
      const score = phraseScore + termScore + structuralBoost;
      return toHit(row, "LEXICAL", score, null, score, 0);
    })
    .sort((a, b) => b.fusedScore - a.fusedScore || a.ordinal - b.ordinal)
    .map((hit, index) => ({ ...hit, rank: index + 1 }));
}

function reciprocalRankFuse(lexical: RetrievalHit[], vector: RetrievalHit[], limit: number): RetrievalHit[] {
  const byId = new Map<string, RetrievalHit & { rrf: number }>();
  for (const [source, method] of [[lexical, "LEXICAL"], [vector, "VECTOR"]] as const) {
    source.forEach((hit, index) => {
      const current = byId.get(hit.chunkId);
      const rrf = (current?.rrf ?? 0) + 1 / (60 + index + 1);
      byId.set(hit.chunkId, {
        ...(current ?? hit),
        lexicalScore: method === "LEXICAL" ? hit.fusedScore : current?.lexicalScore ?? null,
        vectorScore: method === "VECTOR" ? hit.fusedScore : current?.vectorScore ?? null,
        retrievalMethod: "HYBRID_RRF",
        fusedScore: rrf,
        rrf,
      });
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map(({ rrf: _rrf, ...hit }, index) => ({ ...hit, rank: index + 1 }));
}

function toHit(
  row: CandidateRow,
  retrievalMethod: RetrievalHit["retrievalMethod"],
  lexicalScore: number | null,
  vectorScore: number | null,
  fusedScore: number,
  rank: number,
): RetrievalHit {
  return {
    materialId: row.material_id,
    filename: row.filename,
    materialKind: row.material_kind,
    parseRunId: row.parse_run_id,
    chunkId: row.chunk_id,
    ordinal: row.ordinal,
    text: row.text,
    contentHash: row.content_hash,
    location: safeJson(row.location_json),
    metadata: safeJson(row.metadata_json),
    retrievalMethod,
    lexicalScore,
    vectorScore,
    fusedScore,
    rank,
  };
}

async function assertOwnedProject(ownerUserId: string, projectId: string): Promise<void> {
  if (!projectId || projectId === "demo") throw new Error("PROJECT_CONTEXT_REQUIRED");
  const row = await getD1().prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
  ).bind(projectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new Error("PROJECT_NOT_FOUND");
}

function tokenize(value: string): string[] {
  const raw = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/gu)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const directTerms = raw
    .filter((term) => term.length <= 4 || !/[\p{Script=Han}]/u.test(term))
    .map((term) => term.slice(0, 64));
  const chineseBigrams = raw
    .filter((term) => term.length > 4 && /[\p{Script=Han}]/u.test(term))
    .flatMap((term) => Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2)));
  const terms = [...directTerms, ...chineseBigrams];
  return [...new Set(terms)].slice(0, 24);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let cursor = 0;
  while ((cursor = text.indexOf(term, cursor)) >= 0) {
    count += 1;
    cursor += Math.max(term.length, 1);
  }
  return count;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function emptyResult(mode: RetrievalResult["mode"], intent: RetrievalIntent): RetrievalResult {
  return {
    hits: [],
    mode,
    intent,
    targetMaterialId: null,
    parseRunId: null,
    summaryStrategy: null,
    capabilities: { lexical: "READY", vector: getVectorRetriever().capability, reranking: "MISSING" },
  };
}
