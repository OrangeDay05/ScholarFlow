import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import {
  appendM5ConversationMessage,
  archiveM5Conversation,
  createM5ConversationForActor,
  createM5ConversationSummary,
  loadM5ConversationWorkspace,
} from "../db/repositories/m5-conversations.ts";

const migrations = [
  "0000_swift_blue_shield.sql",
  "0001_vengeful_tigra.sql",
  "0002_petite_sir_ram.sql",
  "0003_condemned_magik.sql",
  "0004_nervous_maddog.sql",
  "0005_freezing_nextwave.sql",
  "0006_hot_professor_monster.sql",
  "0007_silky_power_man.sql",
];

test("0007 is additive and creates versioned conversation persistence", async () => {
  const migration = await readFile(
    new URL("../drizzle/0007_silky_power_man.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE `conversation_sessions`/u);
  assert.match(migration, /CREATE TABLE `conversation_messages`/u);
  assert.match(migration, /CREATE TABLE `conversation_summaries`/u);
  assert.match(migration, /DERIVED_NOT_USER_CONFIRMED/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/iu);

  const db = await migratedDatabase();
  const tableCount = db
    .prepare(
      "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get().total;
  assert.equal(tableCount, 63);
  db.close();
});

test("conversation repository preserves idempotency, provenance and owner isolation", async () => {
  const db = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(db);
  seed(db);
  const ownerA = { userId: "user-a", sessionId: "session-a" };
  const ownerB = { userId: "user-b", sessionId: "session-b" };

  const first = await createM5ConversationForActor(ownerA, "project-a", {
    title: "引言修改",
    activeProductSkill: "general_revision",
    idempotencyKey: "conversation-create-1",
  });
  assert.equal(first.replayed, false);
  const replay = await createM5ConversationForActor(ownerA, "project-a", {
    title: "不会覆盖原会话",
    activeProductSkill: "chapter_writing",
    idempotencyKey: "conversation-create-1",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.session.id, first.session.id);
  assert.equal(replay.session.title, "引言修改");

  const messageOne = await appendM5ConversationMessage(
    ownerA,
    "project-a",
    first.session.id,
    { clientMessageId: "message-client-1", role: "USER", content: "请先分析引言。" },
  );
  const messageReplay = await appendM5ConversationMessage(
    ownerA,
    "project-a",
    first.session.id,
    { clientMessageId: "message-client-1", role: "USER", content: "重复请求" },
  );
  assert.equal(messageReplay.replayed, true);
  assert.equal(messageReplay.message.id, messageOne.message.id);
  const messageTwo = await appendM5ConversationMessage(
    ownerA,
    "project-a",
    first.session.id,
    { clientMessageId: "message-client-2", role: "AGENT", content: "已整理修改范围。" },
  );
  assert.equal(messageTwo.message.ordinal, 2);

  const summary = await createM5ConversationSummary(
    ownerA,
    "project-a",
    first.session.id,
    {
      clientSummaryId: "summary-client-1",
      text: "系统根据两条消息生成的派生摘要。",
      sourceMessageIds: [messageOne.message.id, messageTwo.message.id],
    },
  );
  assert.equal(summary.summary.status, "DERIVED_NOT_USER_CONFIRMED");
  assert.deepEqual(summary.summary.sourceMessageIds, [
    messageOne.message.id,
    messageTwo.message.id,
  ]);
  assert.equal(summary.summary.sourceFromOrdinal, 1);
  assert.equal(summary.summary.sourceToOrdinal, 2);

  const workspace = await loadM5ConversationWorkspace(
    ownerA,
    "project-a",
    first.session.id,
  );
  assert.equal(workspace.messages.length, 2);
  assert.equal(workspace.summaries.length, 1);
  assert.equal(workspace.selectedSession.messageCount, 2);
  assert.equal(workspace.selectedSession.summaryCount, 1);

  await assert.rejects(
    () => loadM5ConversationWorkspace(ownerB, "project-a", first.session.id),
    (error) => error.code === "PROJECT_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      createM5ConversationSummary(ownerA, "project-a", first.session.id, {
        clientSummaryId: "summary-client-2",
        text: "错误来源",
        sourceMessageIds: ["message-from-another-session"],
      }),
    (error) => error.code === "INVALID_SUMMARY_SOURCE",
  );

  await archiveM5Conversation(ownerA, "project-a", first.session.id);
  await assert.rejects(
    () =>
      appendM5ConversationMessage(ownerA, "project-a", first.session.id, {
        clientMessageId: "message-client-3",
        role: "USER",
        content: "归档后消息",
      }),
    (error) => error.code === "CONVERSATION_ARCHIVED",
  );
  assert.equal(
    db.prepare("SELECT count(*) AS total FROM conversation_messages").get().total,
    2,
  );
  db.close();
});

test("conversation API keeps authentication and provider execution out of B2B", async () => {
  const route = await readFile(
    new URL(
      "../app/api/m5/projects/[projectId]/conversations/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /requireM4Actor\(request\)/u);
  assert.match(route, /loadM5ConversationWorkspace/u);
  assert.doesNotMatch(route, /openai|deepseek|provider.*execute|api[_-]?key/iu);
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
  db.prepare(
    `INSERT INTO users (id, display_name, email, phone, password_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run("user-a", "A", "a@example.test", null, "hash", now, now);
  db.prepare(
    `INSERT INTO users (id, display_name, email, phone, password_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run("user-b", "B", "b@example.test", null, "hash", now, now);
  db.prepare(
    `INSERT INTO projects (
       id, owner_user_id, title, paper_type, language, primary_creation_method,
       status, current_stage, created_at, updated_at
     ) VALUES (?, ?, ?, 'course_paper', 'zh', 'idea', 'active', 'diagnosis', ?, ?)`,
  ).run("project-a", "user-a", "Project A", now, now);
  db.prepare(
    `INSERT INTO projects (
       id, owner_user_id, title, paper_type, language, primary_creation_method,
       status, current_stage, created_at, updated_at
     ) VALUES (?, ?, ?, 'course_paper', 'zh', 'idea', 'active', 'diagnosis', ?, ?)`,
  ).run("project-b", "user-b", "Project B", now, now);
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
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
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
