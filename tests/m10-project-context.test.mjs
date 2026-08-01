import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import {
  listAvailableProductRoles,
  listProjectAccessForActor,
  loadProjectAccessContext,
  requireProjectEditAccess,
} from "../db/repositories/m10-project-context.ts";
import {
  createM5ConversationForActor,
  loadM5ConversationWorkspace,
} from "../db/repositories/m5-conversations.ts";
import { buildProjectConversationSystemPrompt } from "../app/lib/project-conversation-context.ts";

const actor = (userId) => ({ userId, sessionId: `session-${userId}` });

test("project context separates authors, assigned reviewers and unassigned reviewers", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);

  assert.deepEqual(await listAvailableProductRoles(actor("author-a")), ["AUTHOR"]);
  assert.deepEqual(await listAvailableProductRoles(actor("reviewer-r")), ["REVIEWER"]);
  assert.deepEqual(await listAvailableProductRoles(actor("reviewer-r0")), ["REVIEWER"]);

  const authorProjects = await listProjectAccessForActor(actor("author-a"), "AUTHOR");
  assert.deepEqual(authorProjects.map((item) => item.projectTitle).sort(), ["Alpha", "Beta"]);
  assert.ok(authorProjects.every((item) => item.canEdit && item.role === "AUTHOR"));

  const otherAuthorProjects = await listProjectAccessForActor(actor("author-b"), "AUTHOR");
  assert.deepEqual(otherAuthorProjects.map((item) => item.projectTitle), ["Gamma"]);

  const assigned = await listProjectAccessForActor(actor("reviewer-r"), "REVIEWER");
  assert.deepEqual(assigned.map((item) => item.projectTitle), ["Alpha"]);
  assert.equal(assigned[0].canEdit, false);
  assert.equal(assigned[0].assignmentStatus, "assigned");
  assert.deepEqual(await listProjectAccessForActor(actor("reviewer-r0"), "REVIEWER"), []);

  await assert.rejects(
    () => loadProjectAccessContext(actor("author-a"), "project-gamma"),
    (error) => error.code === "PROJECT_FORBIDDEN",
  );
  await assert.rejects(
    () => loadProjectAccessContext(actor("author-a"), "demo"),
    (error) => error.code === "PROJECT_CONTEXT_REQUIRED",
  );
  await assert.rejects(
    () => requireProjectEditAccess(actor("reviewer-r"), "project-alpha"),
    (error) => error.code === "PROJECT_FORBIDDEN",
  );

  database.close();
});

test("conversations and prompts remain bound to the explicitly selected project", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  const owner = actor("author-a");

  const alpha = await createM5ConversationForActor(owner, "project-alpha", {
    title: "Alpha 讨论",
    activeProductSkill: "general_revision",
    idempotencyKey: "alpha-conversation",
  });
  const beta = await createM5ConversationForActor(owner, "project-beta", {
    title: "Beta 讨论",
    activeProductSkill: "general_revision",
    idempotencyKey: "beta-conversation",
  });
  assert.notEqual(alpha.session.id, beta.session.id);
  assert.equal(alpha.session.projectId, "project-alpha");
  assert.equal(beta.session.projectId, "project-beta");

  await assert.rejects(
    () => loadM5ConversationWorkspace(owner, "project-beta", alpha.session.id),
    (error) => error.code === "CONVERSATION_NOT_FOUND",
  );
  const alphaPrompt = buildProjectConversationSystemPrompt({
    projectId: "project-alpha",
    projectTitle: "Alpha",
    role: "AUTHOR",
  });
  const betaPrompt = buildProjectConversationSystemPrompt({
    projectId: "project-beta",
    projectTitle: "Beta",
    role: "AUTHOR",
  });
  assert.match(alphaPrompt, /Alpha/u);
  assert.doesNotMatch(alphaPrompt, /Beta/u);
  assert.match(betaPrompt, /Beta/u);
  assert.doesNotMatch(betaPrompt, /Alpha/u);

  database.close();
});

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  for (const name of migrations) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    database.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  return database;
}

function seed(database) {
  const now = "2026-08-01T00:00:00.000Z";
  for (const [id, name] of [
    ["author-a", "作者 A"],
    ["author-b", "作者 B"],
    ["reviewer-r", "审核员 R"],
    ["reviewer-r0", "审核员 R0"],
  ]) {
    database.prepare(
      `INSERT INTO users (id, display_name, email, password_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'active', ?, ?)`,
    ).run(id, name, `${id}@example.test`, now, now);
  }
  database.prepare("INSERT INTO workspaces (id, owner_user_id, name) VALUES (?, ?, ?)")
    .run("workspace-a", "author-a", "作者 A 的工作区");
  database.prepare("INSERT INTO workspaces (id, owner_user_id, name) VALUES (?, ?, ?)")
    .run("workspace-b", "author-b", "作者 B 的工作区");
  for (const [id, workspaceId, userId, role] of [
    ["wm-a", "workspace-a", "author-a", "AUTHOR"],
    ["wm-b", "workspace-b", "author-b", "AUTHOR"],
    ["wm-r", "workspace-a", "reviewer-r", "REVIEWER"],
    ["wm-r0", "workspace-a", "reviewer-r0", "REVIEWER"],
  ]) {
    database.prepare(
      "INSERT INTO workspace_memberships (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)",
    ).run(id, workspaceId, userId, role);
  }
  for (const [id, owner, workspace, title] of [
    ["project-alpha", "author-a", "workspace-a", "Alpha"],
    ["project-beta", "author-a", "workspace-a", "Beta"],
    ["project-gamma", "author-b", "workspace-b", "Gamma"],
  ]) {
    database.prepare(
      `INSERT INTO projects (
         id, owner_user_id, workspace_id, title, paper_type, language,
         primary_creation_method, status, current_stage, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'course_paper', 'zh', 'idea', 'active', 'diagnosis', ?, ?)`,
    ).run(id, owner, workspace, title, now, now);
  }
  database.prepare(
    `INSERT INTO project_memberships
       (id, workspace_id, project_id, user_id, role, can_edit)
     VALUES ('pm-r-alpha', 'workspace-a', 'project-alpha', 'reviewer-r', 'REVIEWER', 0)`,
  ).run();
  database.prepare(
    `INSERT INTO review_assignments
       (id, workspace_id, project_id, reviewer_user_id, status)
     VALUES ('ra-r-alpha', 'workspace-a', 'project-alpha', 'reviewer-r', 'assigned')`,
  ).run();
}

class PreparedStatement {
  constructor(adapter, sql, values = []) {
    this.adapter = adapter;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new PreparedStatement(this.adapter, this.sql, values); }
  async first(column) {
    const row = this.adapter.db.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] ?? null : row) : null;
  }
  async all() {
    return { success: true, results: this.adapter.db.prepare(this.sql).all(...this.values) };
  }
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
