import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const enabled = process.env.M4_API_INTEGRATION === "true";
let worker;
let database;

class PreparedStatement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new PreparedStatement(this.db, this.sql, values);
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.values);
    if (!row) return null;
    return column ? row[column] ?? null : row;
  }

  async all() {
    const results = this.db.prepare(this.sql).all(...this.values);
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
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
    return new PreparedStatement(this.db, sql);
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

async function setup() {
  if (worker) return;
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of [
    "0000_swift_blue_shield.sql",
    "0001_vengeful_tigra.sql",
    "0002_petite_sir_ram.sql",
    "0003_condemned_magik.sql",
    "0004_nervous_maddog.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    database.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  workerEnv.DB = new D1DatabaseAdapter(database);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("m4-api-test", `${process.pid}-${Date.now()}`);
  ({ default: worker } = await import(workerUrl.href));
}

async function api(pathname, { email, method = "GET", body } = {}) {
  await setup();
  const headers = new Headers({ accept: "application/json" });
  if (email) headers.set("oai-authenticated-user-email", email);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    {
      DB: new D1DatabaseAdapter(database),
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const payload = await response.json();
  return { response, payload };
}

test("M4 APIs reject anonymous access and isolate project resources", { skip: !enabled }, async () => {
  const anonymous = await api("/api/m4/projects");
  assert.equal(anonymous.response.status, 401);

  const created = await api("/api/m4/projects", {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      primaryCreationMethod: "idea",
      goal: "研究 AI 生成英语阅读材料的难度",
      materialsSummary: "课程要求和三篇文献",
      firstAiHelp: "先判断题目是否可做",
      idempotencyKey: "ignored-body-key",
    },
  });
  assert.equal(created.response.status, 201);
  const projectId = created.payload.data.project.id;

  const ownerList = await api("/api/m4/projects", {
    email: "owner-a@example.test",
  });
  assert.equal(ownerList.payload.data.length, 1);
  const otherList = await api("/api/m4/projects", {
    email: "owner-b@example.test",
  });
  assert.equal(otherList.payload.data.length, 0);
  const crossed = await api(`/api/m4/projects/${projectId}/materials`, {
    email: "owner-b@example.test",
  });
  assert.equal(crossed.response.status, 404);
});

test("M4 persists material, task, privacy, model metadata and PPT contracts without external calls", { skip: !enabled }, async () => {
  const projects = await api("/api/m4/projects", {
    email: "owner-a@example.test",
  });
  const projectId = projects.payload.data[0].id;
  const material = await api(`/api/m4/projects/${projectId}/materials`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      kind: "data",
      filename: "participants.csv",
      contentType: "text/csv",
      sizeBytes: 128,
    },
  });
  assert.equal(material.response.status, 201);
  const materialId = material.payload.data.id;

  const task = await api(`/api/m4/projects/${projectId}/tasks`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      action: "create",
      task_role: "GENERATOR",
      product_skill: "章节写作",
      task_type: "draft",
      review_mode: "none",
      selected_material_ids: [materialId],
      max_calls: 1,
      timeout_seconds: 60,
      idempotency_key: "task-a-1",
      models: [],
    },
  });
  assert.equal(task.response.status, 201);
  const taskId = task.payload.data.id;

  const profile = await api(`/api/m4/projects/${projectId}/privacy`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      action: "profile",
      material_id: materialId,
      direct_identifiers: ["姓名"],
      indirect_identifiers: ["班级"],
      sensitive_attributes: ["成绩"],
      research_necessary_variables: ["实验条件"],
      ordinary_research_content: ["回答文本"],
      confidentiality_restrictions: [],
      copyright_restrictions: [],
      recommended_mode: "PSEUDONYMIZED",
      confirm: true,
    },
  });
  assert.equal(profile.response.status, 201);
  const profileId = profile.payload.data.profiles[0].id;
  const checks = [
    "EXPERIMENTAL_CONDITIONS",
    "SAMPLE_COUNT",
    "PARTICIPANT_SEPARATION",
    "CHRONOLOGY",
    "RESEARCH_NECESSARY_VARIABLES",
    "NUMERIC_PRECISION",
    "SPEAKER_RELATIONSHIPS",
  ].map((type) => ({
    type,
    status: "PASSED",
    detail: "保持不变",
    blocking: false,
  }));
  const copy = await api(`/api/m4/projects/${projectId}/privacy`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      action: "copy",
      material_id: materialId,
      profile_id: profileId,
      mode: "PSEUDONYMIZED",
      transformations: ["仅替换直接标识符"],
      approved_by_user: true,
      fidelity_checks: checks,
    },
  });
  assert.equal(copy.response.status, 201);
  assert.equal(copy.payload.data.copies[0].status, "READY");

  const transmission = await api(`/api/m4/projects/${projectId}/privacy`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      action: "transmission",
      task_id: taskId,
      material_id: materialId,
      processing_copy_id: copy.payload.data.copies[0].id,
      provider_key: "openai",
      purpose: "生成任务上下文",
    },
  });
  assert.equal(transmission.payload.data.transmissions[0].status, "PLANNED");

  const models = await api(`/api/m4/projects/${projectId}/model-configs`, {
    email: "owner-a@example.test",
  });
  assert.equal(models.response.status, 200);
  assert.equal(models.payload.data.providers.length, 2);
  const plaintext = await api(`/api/m4/projects/${projectId}/model-configs`, {
    email: "owner-a@example.test",
    method: "POST",
    body: { action: "credential", api_key: "must-not-be-accepted" },
  });
  assert.equal(plaintext.response.status, 400);
  assert.equal(plaintext.payload.error.code, "PLAINTEXT_KEY_REJECTED");

  const presentation = await api(`/api/m4/projects/${projectId}/presentations`, {
    email: "owner-a@example.test",
    method: "POST",
    body: {
      action: "create",
      title: "课程论文汇报",
      scene: "COURSE_PRESENTATION",
      readiness_status: "READY_WITH_WARNINGS",
      truth_status: "PARTIALLY_VERIFIED",
      source_material_snapshot: [materialId],
      audience: "课程同学",
      duration_minutes: 10,
    },
  });
  assert.equal(presentation.response.status, 201);
  assert.equal(presentation.payload.data.projects[0].scene, "COURSE_PRESENTATION");
});

test.after(() => {
  database?.close();
});
