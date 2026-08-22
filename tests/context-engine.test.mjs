import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import { assembleAgentContext } from "../app/lib/context-engine/context-engine.ts";
import { getContextPolicy } from "../app/lib/context-engine/context-policies.ts";
import {
  ContextRetrievalError,
  planRetrieval,
  resolveRetrievalIntent,
  retrieveProjectContext,
} from "../app/lib/context-engine/retrieval.ts";
import {
  createAgentHandoff,
  loadAgentWorkingMemories,
  loadContextSnapshot,
  loadIncomingAgentHandoffs,
  saveAgentWorkingMemory,
} from "../db/repositories/context-engine.ts";
import {
  createEvidenceCandidateFromSnapshot,
  decideEvidenceCandidate,
} from "../db/repositories/evidence-provenance.ts";

const owner = { userId: "user-a", sessionId: "session-a" };

test("query-driven retrieval finds a relevant late chunk and never crosses project or authorization scope", async () => {
  const database = await setup();
  seed(database);
  const plan = planRetrieval({
    query: "稀有证据目标 alpha-needle",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 10,
  });
  const result = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan,
  });
  assert.equal(result.mode, "LEXICAL_ONLY");
  assert.equal(result.capabilities.vector, "CONFIGURATION_REQUIRED");
  assert.equal(result.hits[0].ordinal, 20);
  assert.match(result.hits[0].text, /alpha-needle/u);
  assert.ok(result.hits.every((hit) => hit.materialId === "material-a"));

  const stalePlan = planRetrieval({
    query: "historical-secret",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 10,
  });
  const stale = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan: stalePlan,
  });
  assert.equal(stale.hits.length, 0, "older successful parse runs must not enter context");

  const requirementPlan = planRetrieval({
    query: "导师要求多少字 BCC",
    agentRole: "RESEARCH_PLANNER",
    taskIntent: "project_diagnosis_outline",
    materialKinds: ["requirement", "manuscript"],
    maxIncluded: 10,
  });
  const requirementResult = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a", "material-requirement"],
    plan: requirementPlan,
  });
  assert.equal(requirementResult.hits[0].materialKind, "requirement");
  assert.match(requirementResult.hits[0].text, /BCC/u);

  const unauthorized = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-b"],
    plan,
  });
  assert.equal(unauthorized.hits.length, 0);
  database.close();
});

test("whole-document intents read authorized active chunks without keyword matching", async () => {
  const database = await setup();
  seed(database);
  const summaryIntent = resolveRetrievalIntent("总结一下我的初稿", [
    { id: "material-a", kind: "manuscript", filename: "alpha.docx", status: "success", authorized: true },
  ]);
  assert.deepEqual(summaryIntent, { intent: "DOCUMENT_SUMMARY", targetMaterialId: "material-a" });
  const summaryPlan = planRetrieval({
    query: "总结一下我的初稿",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 30,
    ...summaryIntent,
  });
  const summary = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan: summaryPlan,
    retrievalTokenBudget: 5_000,
  });
  assert.equal(summary.mode, "DOCUMENT_FULL");
  assert.equal(summary.summaryStrategy, "FULL_DOCUMENT");
  assert.equal(summary.parseRunId, "parse-a");
  assert.equal(summary.hits.length, 25);
  assert.deepEqual(summary.hits.map((hit) => hit.ordinal), Array.from({ length: 25 }, (_, index) => index));
  assert.ok(summary.hits.every((hit) => hit.parseRunId === "parse-a"));
  assert.ok(summary.hits.every((hit) => !hit.text.includes("historical-secret")));

  const readIntent = resolveRetrievalIntent("你先看看我的初稿", [
    { id: "material-a", kind: "manuscript", filename: "alpha.docx", status: "success", authorized: true },
  ]);
  assert.equal(readIntent.intent, "DOCUMENT_READ");
  const factIntent = resolveRetrievalIntent("我的初稿里 BCC 是怎么定义的？", [
    { id: "material-a", kind: "manuscript", filename: "alpha.docx", status: "success", authorized: true },
  ]);
  assert.equal(factIntent.intent, "FACT_LOOKUP");
  database.close();
});

test("long whole-document reads use ordinal coverage across the document", async () => {
  const database = await setup();
  seed(database);
  const plan = planRetrieval({
    query: "概括全文",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 30,
    intent: "DOCUMENT_SUMMARY",
    targetMaterialId: "material-a",
  });
  const result = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan,
    retrievalTokenBudget: 12,
  });
  assert.equal(result.mode, "DOCUMENT_ORDINAL_COVERAGE");
  assert.equal(result.summaryStrategy, "ORDINAL_COVERAGE");
  assert.ok(result.hits.length >= 2);
  assert.equal(result.hits[0].ordinal, 0);
  assert.equal(result.hits.at(-1).ordinal, 24);
  assert.ok(result.hits.some((hit) => hit.ordinal > 12), "coverage must not only take the first chunks");
  database.close();
});

test("whole-document target selection is explicit and preserves authorization", async () => {
  const materials = [
    { id: "material-a", kind: "manuscript", filename: "alpha.docx", status: "success", authorized: true },
    { id: "material-c", kind: "manuscript", filename: "牛马_proposal_完整版.docx", status: "success", authorized: true },
  ];
  assert.throws(
    () => resolveRetrievalIntent("总结我的初稿", materials),
    (error) => error instanceof ContextRetrievalError && error.code === "MATERIAL_SELECTION_REQUIRED",
  );
  assert.deepEqual(resolveRetrievalIntent("总结《牛马_proposal_完整版.docx》", materials), {
    intent: "DOCUMENT_SUMMARY",
    targetMaterialId: "material-c",
  });
  assert.throws(
    () => resolveRetrievalIntent("总结《牛马_proposal_完整版.docx》", materials.map((item) => ({ ...item, authorized: item.id !== "material-c" }))),
    (error) => error instanceof ContextRetrievalError && error.code === "MATERIAL_NOT_AUTHORIZED",
  );
});

test("whole-document context is snapshotted while real no-evidence lookup remains NO_MATCH", async () => {
  const database = await setup();
  seed(database);
  database.prepare(`INSERT INTO conversation_messages (id, owner_user_id, project_id,
      conversation_session_id, client_message_id, ordinal, role, content, created_at)
    VALUES ('message-stale-no-match', 'user-a', 'project-a', 'conversation-a',
      'client-stale-no-match', 2, 'AGENT', 'STALE_SENTINEL NO_MATCH，请重新上传或粘贴正文。', ?)`)
    .run("2026-08-09T00:00:01.000Z");
  const assembled = await assembleAgentContext({
    actor: owner,
    projectId: "project-a",
    conversationSessionId: "conversation-a",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    query: "总结一下我的初稿",
    authorizedMaterialIds: ["material-a"],
    baseSystemPrompt: "基于材料回答。",
  });
  assert.equal(assembled.snapshot.taskIntent, "DOCUMENT_SUMMARY");
  assert.equal(assembled.snapshot.retrievalMode, "DOCUMENT_FULL");
  assert.equal(assembled.snapshot.items.filter((item) => item.itemType === "RETRIEVED_CHUNK" && item.included).length, 25);
  assert.match(assembled.messages[0].content, /Authorized document content/u);
  assert.match(assembled.messages[0].content, /supersedes any earlier conversation message that reported NO_MATCH/u);
  assert.match(assembled.messages[0].content, /alpha-needle/u);
  assert.doesNotMatch(assembled.messages[0].content, /historical-secret/u);
  assert.ok(assembled.snapshot.items.some((item) => item.content.includes("STALE_SENTINEL")), "snapshot keeps the real conversation history");
  assert.ok(assembled.messages.every((message) => !message.content.includes("STALE_SENTINEL")), "stale operational failures must not steer a successful document read");
  const persisted = database.prepare(`SELECT retrieval_filters_json FROM agent_context_snapshots WHERE id = ?`).get(assembled.snapshot.id);
  const filters = JSON.parse(persisted.retrieval_filters_json);
  assert.equal(filters.targetMaterialId, "material-a");
  assert.equal(filters.parseRunId, "parse-a");
  assert.equal(filters.summaryStrategy, "FULL_DOCUMENT");
  assert.equal(filters.includedChunkIds.length, 25);

  const factPlan = planRetrieval({
    query: "导师要求几个关键词？",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 10,
  });
  const noMatch = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan: factPlan,
  });
  assert.equal(noMatch.intent, "FACT_LOOKUP");
  assert.equal(noMatch.mode, "NO_MATCH");

  const chineseFactPlan = planRetrieval({
    query: "根据这个初稿，你觉得我现在的研究设计最大的问题是什么？alpha-needle",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    materialKinds: ["manuscript"],
    maxIncluded: 10,
  });
  const chineseFact = await retrieveProjectContext({
    actor: owner,
    projectId: "project-a",
    authorizedMaterialIds: ["material-a"],
    plan: chineseFactPlan,
  });
  assert.equal(chineseFact.mode, "LEXICAL_ONLY");
  assert.match(chineseFact.hits[0].text, /alpha-needle/u);
  database.close();
});

test("agent private memory and structured handoffs are role-scoped", async () => {
  const database = await setup();
  seed(database);
  await saveAgentWorkingMemory(owner, "project-a", {
    conversationSessionId: "conversation-a",
    agentRole: "WRITER",
    scopeType: "SECTION",
    scopeId: "section-a",
    memoryType: "DRAFT_PLAN",
    content: { plan: "writer-only" },
  });
  assert.equal((await loadAgentWorkingMemories(owner, "project-a", "WRITER", "conversation-a")).length, 1);
  assert.equal((await loadAgentWorkingMemories(owner, "project-a", "REVIEWER", "conversation-a")).length, 0);

  await createAgentHandoff(owner, "project-a", {
    conversationSessionId: "conversation-a",
    fromAgentRole: "RESEARCH_PLANNER",
    toAgentRole: "WRITER",
    goal: "按已确认提纲起草第一节",
    confirmedInputs: ["diagnosis-card-a"],
    recommendedMaterialIds: ["material-a"],
  });
  assert.equal((await loadIncomingAgentHandoffs(owner, "project-a", "WRITER")).length, 1);
  assert.equal((await loadIncomingAgentHandoffs(owner, "project-a", "REVIEWER")).length, 0);
  database.close();
});

test("context engine persists an immutable, traceable snapshot with dynamic policy budget", async () => {
  const database = await setup();
  seed(database);
  const assembled = await assembleAgentContext({
    actor: owner,
    projectId: "project-a",
    conversationSessionId: "conversation-a",
    agentRole: "CONVERSATION_AGENT",
    taskIntent: "PROJECT_CONVERSATION",
    query: "请找稀有证据目标 alpha-needle",
    currentSectionSlug: "introduction",
    authorizedMaterialIds: ["material-a", "material-b"],
    provider: "deepseek",
    model: "deepseek-v4-flash",
    baseSystemPrompt: "只根据正式事实和本轮上下文回答。",
  });
  assert.equal(assembled.snapshot.projectId, "project-a");
  assert.deepEqual(assembled.snapshot.authorizedMaterialIds, ["material-a"]);
  assert.equal(assembled.snapshot.retrievalMode, "LEXICAL_ONLY");
  assert.equal(assembled.snapshot.tokenBudget, getContextPolicy("CONVERSATION_AGENT").totalTokenBudget);
  assert.ok(assembled.snapshot.estimatedContextTokens < assembled.snapshot.tokenBudget);
  const evidence = assembled.snapshot.items.find((item) => item.itemType === "RETRIEVED_CHUNK");
  assert.equal(evidence.filename, "alpha.docx");
  assert.match(evidence.content, /alpha-needle/u);
  assert.equal(evidence.location.paragraph, 21);
  assert.match(assembled.messages[0].content, /Confirmed DiagnosisCard v1/u);
  assert.match(assembled.messages[0].content, /If no relevant authorized evidence/u);

  database.prepare(`INSERT INTO claims (id, owner_user_id, project_id, section_version_id, text, created_at)
    VALUES ('claim-a', 'user-a', 'project-a', 'section-version-a', 'readability formulas are insufficient', ?)`)
    .run("2026-08-09T00:00:00.000Z");
  const evidenceCandidateId = await createEvidenceCandidateFromSnapshot(owner, "project-a", {
    contextSnapshotItemId: evidence.id,
    claimText: "readability formulas are insufficient",
    quote: "稀有证据目标 alpha-needle",
  });
  const evidenceDecision = await decideEvidenceCandidate(owner, "project-a", {
    candidateId: evidenceCandidateId,
    decision: "CONFIRM",
    claimId: "claim-a",
  });
  const binding = database.prepare(`SELECT material_id, material_chunk_id, paragraph,
      verification_status FROM evidence_bindings WHERE id = ?`).get(evidenceDecision.evidenceBindingId);
  assert.equal(binding.material_id, "material-a");
  assert.equal(binding.material_chunk_id, evidence.materialChunkId);
  assert.equal(binding.paragraph, "21");
  assert.equal(binding.verification_status, "UNVERIFIED");

  const reloaded = await loadContextSnapshot(owner, "project-a", assembled.snapshot.id);
  assert.equal(reloaded.id, assembled.snapshot.id);
  assert.throws(() => database.prepare(
    "UPDATE agent_context_snapshots SET task_intent = 'MUTATED' WHERE id = ?",
  ).run(assembled.snapshot.id), /immutable/u);
  database.close();
});

test("no-evidence and no-authorization paths are explicit and do not send material text", async () => {
  const database = await setup();
  seed(database);
  const assembled = await assembleAgentContext({
    actor: owner,
    projectId: "project-a",
    conversationSessionId: "conversation-a",
    agentRole: "VERIFIER",
    taskIntent: "VERIFY_CLAIM",
    query: "不存在的证据 qqq-no-match",
    currentSectionSlug: "introduction",
    authorizedMaterialIds: [],
    baseSystemPrompt: "核验证据。",
  });
  assert.equal(assembled.snapshot.retrievalMode, "NO_AUTHORIZED_MATERIALS");
  assert.equal(assembled.snapshot.items.some((item) => item.itemType === "RETRIEVED_CHUNK"), false);
  assert.match(assembled.messages[0].content, /Do not claim the project materials contain an answer/u);
  assert.doesNotMatch(assembled.messages[0].content, /alpha-needle/u);
  database.close();
});

async function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  for (const name of migrations) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    database.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  workerEnv.DB = new D1DatabaseAdapter(database);
  delete workerEnv.AI;
  delete workerEnv.MATERIAL_VECTOR_INDEX;
  return database;
}

function seed(database) {
  const now = "2026-08-09T00:00:00.000Z";
  database.prepare(`INSERT INTO users (id, email, display_name, status, created_at, updated_at)
    VALUES ('user-a', 'a@example.test', 'A', 'active', ?, ?),
           ('user-b', 'b@example.test', 'B', 'active', ?, ?)`)
    .run(now, now, now, now);
  database.prepare(`INSERT INTO projects (
      id, owner_user_id, title, paper_type, language, primary_creation_method,
      onboarding_mode, status, current_stage, created_at, updated_at
    ) VALUES ('project-a', 'user-a', 'Alpha Project', 'journal', 'zh', 'existing_draft',
      'direct', 'active', 'writing', ?, ?),
      ('project-b', 'user-b', 'Beta Project', 'journal', 'zh', 'existing_draft',
      'direct', 'active', 'writing', ?, ?)`)
    .run(now, now, now, now);
  database.prepare(`INSERT INTO diagnosis_cards (
      id, owner_user_id, project_id, version_number, status, title, paper_type, language,
      research_object, research_question, method, requirements, confirmed_at, created_at, updated_at
    ) VALUES ('diagnosis-card-a', 'user-a', 'project-a', 1, 'confirmed', 'Alpha Diagnosis',
      'journal', 'zh', '对象 A', '问题 A', '方法 A', '要求 A', ?, ?, ?)`)
    .run(now, now, now);
  database.prepare(`INSERT INTO outlines (id, owner_user_id, project_id, diagnosis_card_id,
      version_number, status, confirmed_at, created_at, updated_at)
    VALUES ('outline-a', 'user-a', 'project-a', 'diagnosis-card-a', 1, 'confirmed', ?, ?, ?)`)
    .run(now, now, now);
  database.prepare(`INSERT INTO sections (id, owner_user_id, project_id, outline_id, slug, title,
      position, status, word_count, created_at, updated_at)
    VALUES ('section-a', 'user-a', 'project-a', 'outline-a', 'introduction', 'Introduction',
      1, 'editing', 10, ?, ?)`)
    .run(now, now);
  database.prepare(`INSERT INTO section_versions (id, owner_user_id, project_id, section_id,
      version_number, source, content, content_hash, summary, created_at)
    VALUES ('section-version-a', 'user-a', 'project-a', 'section-a', 1, 'manual',
      '当前章节正文', 'section-hash', '', ?)`)
    .run(now);
  database.prepare(`INSERT INTO conversation_sessions (id, owner_user_id, project_id, title,
      status, idempotency_key, message_count, summary_count, created_at, updated_at)
    VALUES ('conversation-a', 'user-a', 'project-a', 'Conversation', 'ACTIVE', 'conversation-key', 1, 0, ?, ?)`)
    .run(now, now);
  database.prepare(`INSERT INTO conversation_messages (id, owner_user_id, project_id,
      conversation_session_id, client_message_id, ordinal, role, content, created_at)
    VALUES ('message-a', 'user-a', 'project-a', 'conversation-a', 'client-message-a', 1,
      'USER', '请找稀有证据目标 alpha-needle', ?)`)
    .run(now);
  seedMaterial(database, {
    owner: "user-a", project: "project-a", material: "material-a", object: "object-a",
    run: "parse-a", filename: "alpha.docx", needle: "alpha-needle", now,
  });
  seedMaterial(database, {
    owner: "user-a", project: "project-a", material: "material-requirement", object: "object-requirement",
    run: "parse-requirement", filename: "导师要求.txt", kind: "requirement", needle: "导师要求多少字 BCC", now,
  });
  database.prepare(`INSERT INTO material_parse_runs (id, owner_user_id, project_id, material_id,
      material_object_id, parser_key, parser_version, format, content_hash, status,
      idempotency_key, chunk_count, started_at, finished_at, created_at, updated_at)
    VALUES ('parse-a-old', 'user-a', 'project-a', 'material-a', 'object-a', 'docx', '1',
      'DOCX', 'old-hash', 'SUCCEEDED', 'old-parse-key', 1, ?, ?, ?, ?)`)
    .run("2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z", "2026-08-08T00:00:00.000Z");
  database.prepare(`INSERT INTO material_chunks (id, owner_user_id, project_id, material_id,
      parse_run_id, ordinal, text, location_json, metadata_json, content_hash, created_at)
    VALUES ('old-secret-chunk', 'user-a', 'project-a', 'material-a', 'parse-a-old', 0,
      'historical-secret only appears in the superseded parse', '{"paragraph":1}', '{}', 'old-secret-hash', ?)`)
    .run("2026-08-08T00:00:00.000Z");
  seedMaterial(database, {
    owner: "user-b", project: "project-b", material: "material-b", object: "object-b",
    run: "parse-b", filename: "beta.docx", needle: "alpha-needle private beta", now,
  });
}

function seedMaterial(database, value) {
  database.prepare(`INSERT INTO materials (id, owner_user_id, project_id, kind, filename,
      content_type, size_bytes, object_key, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      100, ?, 'success', ?, ?)`)
    .run(value.material, value.owner, value.project, value.kind ?? "manuscript", value.filename, `objects/${value.material}`, value.now, value.now);
  database.prepare(`INSERT INTO material_objects (id, owner_user_id, project_id, material_id,
      object_key, storage_provider, original_filename, normalized_filename, detected_extension,
      detected_content_type, size_bytes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'R2', ?, ?, 'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100, 'STORED', ?, ?)`)
    .run(value.object, value.owner, value.project, value.material, `objects/${value.material}`,
      value.filename, value.filename, value.now, value.now);
  database.prepare(`INSERT INTO material_parse_runs (id, owner_user_id, project_id, material_id,
      material_object_id, parser_key, parser_version, format, content_hash, status,
      idempotency_key, chunk_count, started_at, finished_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'docx', '1', 'DOCX', ?, 'SUCCEEDED', ?, 25, ?, ?, ?, ?)`)
    .run(value.run, value.owner, value.project, value.material, value.object, `hash-${value.run}`,
      `parse-key-${value.run}`, value.now, value.now, value.now, value.now);
  const insert = database.prepare(`INSERT INTO material_chunks (id, owner_user_id, project_id,
      material_id, parse_run_id, ordinal, text, location_json, metadata_json, content_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`);
  for (let ordinal = 0; ordinal < 25; ordinal += 1) {
    const text = ordinal === 20 ? `第 21 段包含稀有证据目标 ${value.needle}` : `普通背景段落 ${ordinal}`;
    insert.run(`${value.run}-chunk-${ordinal}`, value.owner, value.project, value.material,
      value.run, ordinal, text, JSON.stringify({ paragraph: ordinal + 1 }),
      `chunk-hash-${value.run}-${ordinal}`, value.now);
  }
}

class PreparedStatement {
  constructor(adapter, sql, values = []) { this.adapter = adapter; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.adapter, this.sql, values); }
  async first(column) {
    const row = this.adapter.db.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] ?? null : row) : null;
  }
  async all() { return { success: true, results: this.adapter.db.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.adapter.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class D1DatabaseAdapter {
  constructor(db) { this.db = db; }
  prepare(sql) { return new PreparedStatement(this, sql); }
  async batch(statements) {
    const results = [];
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
