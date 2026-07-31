import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import {
  createM5ActionProposalForActor,
  decideM5ActionProposalForActor,
  loadM5ActionProposalWorkspace,
} from "../db/repositories/m5-action-proposals.ts";
import {
  archiveM5Conversation,
  createM5ConversationForActor,
} from "../db/repositories/m5-conversations.ts";

const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
  .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
  .sort();

test("proposal migrations are additive and preserve the explicit confirmation gate", async () => {
  const migration = await readFile(
    new URL("../drizzle/0008_common_swordsman.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE `conversation_tool_intents`/u);
  assert.match(migration, /CREATE TABLE `conversation_action_proposals`/u);
  assert.match(migration, /CREATE TABLE `conversation_action_decisions`/u);
  assert.match(migration, /WAITING_FOR_USER/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/iu);

  const db = await migratedDatabase();
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .get().total,
    84,
  );
  db.close();
});

test("proposal decisions are isolated, idempotent and never execute a task", async () => {
  const db = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(db);
  seed(db);
  const ownerA = { userId: "user-a", sessionId: "session-a" };
  const ownerB = { userId: "user-b", sessionId: "session-b" };
  const session = await createM5ConversationForActor(ownerA, "project-a", {
    title: "引言任务",
    activeProductSkill: "chapter_writing",
    idempotencyKey: "proposal-session-1",
  });
  seedSection(db);

  const created = await createM5ActionProposalForActor(ownerA, "project-a", {
    conversationSessionId: session.session.id,
    productSkill: "chapter_writing",
    operation: "准备引言写作任务",
    rationale: "用户希望推进引言",
    authorizedMaterialIds: ["material-a", "material-a"],
    title: "创建引言候选版本",
    effect: "确认后只进入待执行队列。",
    warnings: ["尚未执行真实模型。"],
    idempotencyKey: "proposal-create-1",
    scopeSectionSlug: "introduction",
    baseVersionId: "version-a",
    excludedScope: "当前章节以外内容",
  });
  assert.equal(created.replayed, false);
  assert.equal(created.proposal.status, "AWAITING_USER_CONFIRMATION");
  assert.equal(created.proposal.recoveryStatus, "WAITING_FOR_USER");
  assert.deepEqual(created.intent.authorizedMaterialIds, ["material-a"]);
  assert.equal(created.intent.sectionId, "section-a");
  assert.equal(created.intent.baseVersionId, "version-a");
  assert.equal(db.prepare("SELECT count(*) AS total FROM ai_tasks").get().total, 0);
  const waiting = await loadM5ActionProposalWorkspace(
    ownerA,
    "project-a",
    session.session.id,
  );
  assert.equal(waiting.recovery.action, "WAIT_FOR_USER");
  assert.equal(waiting.recovery.retryPolicy, "REUSE_IDEMPOTENCY_KEY");

  const replay = await createM5ActionProposalForActor(ownerA, "project-a", {
    conversationSessionId: session.session.id,
    productSkill: "general_revision",
    operation: "不应覆盖",
    rationale: "重复请求",
    authorizedMaterialIds: [],
    title: "不应覆盖",
    effect: "不应覆盖",
    warnings: [],
    idempotencyKey: "proposal-create-1",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.proposal.id, created.proposal.id);
  assert.equal(replay.proposal.title, "创建引言候选版本");

  await assert.rejects(
    () =>
      createM5ActionProposalForActor(ownerA, "project-a", {
        conversationSessionId: session.session.id,
        productSkill: "chapter_writing",
        operation: "越权材料",
        rationale: "测试",
        authorizedMaterialIds: ["material-b"],
        title: "越权",
        effect: "无",
        warnings: [],
        idempotencyKey: "proposal-create-2",
      }),
    (error) => error.code === "INVALID_MATERIAL_SCOPE",
  );
  await assert.rejects(
    () =>
      loadM5ActionProposalWorkspace(ownerB, "project-a", session.session.id),
    (error) => error.code === "PROJECT_NOT_FOUND",
  );

  const confirmed = await decideM5ActionProposalForActor(ownerA, "project-a", {
    conversationSessionId: session.session.id,
    proposalId: created.proposal.id,
    decision: "CONFIRM",
    reason: "同意进入待执行队列",
    idempotencyKey: "proposal-decision-1",
  });
  assert.equal(confirmed.proposal.status, "CONFIRMED");
  assert.equal(confirmed.proposal.recoveryStatus, "READY_TO_QUEUE");
  assert.equal(confirmed.decision.decision, "CONFIRM");
  assert.equal(db.prepare("SELECT count(*) AS total FROM ai_tasks").get().total, 0);

  const decisionReplay = await decideM5ActionProposalForActor(
    ownerA,
    "project-a",
    {
      conversationSessionId: session.session.id,
      proposalId: created.proposal.id,
      decision: "CONFIRM",
      reason: "重复确认",
      idempotencyKey: "proposal-decision-1",
    },
  );
  assert.equal(decisionReplay.replayed, true);
  assert.equal(decisionReplay.decision.id, confirmed.decision.id);
  await assert.rejects(
    () =>
      decideM5ActionProposalForActor(ownerA, "project-a", {
        conversationSessionId: session.session.id,
        proposalId: created.proposal.id,
        decision: "REJECT",
        reason: null,
        idempotencyKey: "proposal-decision-2",
      }),
    (error) => error.code === "PROPOSAL_ALREADY_DECIDED",
  );

  const restored = await loadM5ActionProposalWorkspace(
    ownerA,
    "project-a",
    session.session.id,
  );
  assert.equal(restored.intents.length, 1);
  assert.equal(restored.proposals[0].recoveryStatus, "READY_TO_QUEUE");
  assert.equal(restored.decisions[0].decision, "CONFIRM");
  assert.equal(restored.recovery.action, "READY_TO_QUEUE");

  await archiveM5Conversation(ownerA, "project-a", session.session.id);
  await assert.rejects(
    () =>
      createM5ActionProposalForActor(ownerA, "project-a", {
        conversationSessionId: session.session.id,
        productSkill: "chapter_writing",
        operation: "归档后操作",
        rationale: "测试",
        authorizedMaterialIds: [],
        title: "归档后",
        effect: "无",
        warnings: [],
        idempotencyKey: "proposal-create-3",
      }),
    (error) => error.code === "CONVERSATION_ARCHIVED",
  );
  db.close();
});

test("proposal API requires a real actor and contains no execution path", async () => {
  const route = await readFile(
    new URL(
      "../app/api/m5/projects/[projectId]/conversations/proposals/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const repository = await readFile(
    new URL("../db/repositories/m5-action-proposals.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireM4Actor\(request\)/u);
  assert.match(repository, /READY_TO_QUEUE/u);
  assert.doesNotMatch(`${route}\n${repository}`, /INSERT INTO ai_tasks|CALLING_MODEL|openai|deepseek/iu);
});

async function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    db.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

function seed(db) {
  const now = "2026-07-28T00:00:00.000Z";
  for (const [id, email] of [
    ["user-a", "a@example.test"],
    ["user-b", "b@example.test"],
  ]) {
    db.prepare(
      `INSERT INTO users (id, display_name, email, password_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'active', ?, ?)`,
    ).run(id, id, email, now, now);
  }
  for (const [id, owner] of [
    ["project-a", "user-a"],
    ["project-b", "user-b"],
  ]) {
    db.prepare(
      `INSERT INTO projects (
         id, owner_user_id, title, paper_type, language, primary_creation_method,
         status, current_stage, created_at, updated_at
       ) VALUES (?, ?, ?, 'course_paper', 'zh', 'idea', 'active', 'diagnosis', ?, ?)`,
    ).run(id, owner, id, now, now);
  }
  for (const [id, owner, project] of [
    ["material-a", "user-a", "project-a"],
    ["material-b", "user-b", "project-b"],
  ]) {
    db.prepare(
      `INSERT INTO materials (
         id, owner_user_id, project_id, kind, filename, content_type,
         size_bytes, status, created_at, updated_at
       ) VALUES (?, ?, ?, 'note', ?, 'text/plain', 10, 'awaiting_parse', ?, ?)`,
    ).run(id, owner, project, `${id}.txt`, now, now);
  }
}

function seedSection(db) {
  db.prepare("INSERT INTO diagnosis_cards (id, owner_user_id, project_id, version_number, status, title, paper_type, language) VALUES (?, ?, ?, 1, 'confirmed', 'P', 'course_paper', 'zh')").run("diagnosis-a", "user-a", "project-a");
  db.prepare("INSERT INTO outlines (id, owner_user_id, project_id, diagnosis_card_id, version_number, status) VALUES (?, ?, ?, ?, 1, 'confirmed')").run("outline-a", "user-a", "project-a", "diagnosis-a");
  db.prepare("INSERT INTO sections (id, owner_user_id, project_id, outline_id, slug, title, position) VALUES (?, ?, ?, ?, 'introduction', '引言', 1)").run("section-a", "user-a", "project-a", "outline-a");
  db.prepare("INSERT INTO section_versions (id, owner_user_id, project_id, section_id, version_number, source, content, content_hash) VALUES (?, ?, ?, ?, 1, 'manual', '原始章节', 'hash')").run("version-a", "user-a", "project-a", "section-a");
}

class PreparedStatement {
  constructor(adapter, sql, values = []) {
    this.adapter = adapter;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new PreparedStatement(this.adapter, this.sql, values);
  }
  async first(column) {
    const row = this.adapter.db.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] ?? null : row) : null;
  }
  async all() {
    return {
      success: true,
      results: this.adapter.db.prepare(this.sql).all(...this.values),
      meta: { changes: 0 },
    };
  }
  async run() {
    const result = this.adapter.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

class D1DatabaseAdapter {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new PreparedStatement(this, sql);
  }
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
