import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const enabled = process.env.M4_API_INTEGRATION === "true";
let worker;
let database;
let ownerACookie;
let ownerBCookie;

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
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrationNames) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    database.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  workerEnv.DB = new D1DatabaseAdapter(database);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("m4-api-test", `${process.pid}-${Date.now()}`);
  ({ default: worker } = await import(workerUrl.href));
}

async function api(pathname, { cookie, headers: extraHeaders, method = "GET", body } = {}) {
  await setup();
  const headers = new Headers({ accept: "application/json" });
  if (cookie) headers.set("cookie", cookie);
  for (const [name, value] of Object.entries(extraHeaders ?? {})) headers.set(name, value);
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

async function register(email, phone, displayName) {
  const result = await api("/api/auth/register", {
    method: "POST",
    body: {
      display_name: displayName,
      email,
      phone,
      password: "Secure-pass-123",
      confirm_password: "Secure-pass-123",
    },
  });
  assert.equal(result.response.status, 201);
  const setCookie = result.response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  return setCookie.split(";", 1)[0];
}

async function login(identifier, password = "Secure-pass-123") {
  return api("/api/auth/login", {
    method: "POST",
    body: { identifier, password },
  });
}

test("CORE-01 registers, hashes passwords, authenticates sessions and revokes logout", { skip: !enabled }, async () => {
  const anonymous = await api("/api/auth/session");
  assert.equal(anonymous.response.status, 401);

  const mismatch = await api("/api/auth/register", {
    method: "POST",
    body: {
      display_name: "Mismatch",
      email: "mismatch@example.test",
      phone: "+8613800000099",
      password: "Secure-pass-123",
      confirm_password: "different-pass",
    },
  });
  assert.equal(mismatch.response.status, 400);
  assert.equal(mismatch.payload.error.code, "VALIDATION_ERROR");

  const missing = await api("/api/auth/register", { method: "POST", body: {} });
  assert.equal(missing.response.status, 400);

  ownerACookie = await register("OWNER-A@example.test", "+86 138 0000 0001", "Owner A");
  const storedA = database
    .prepare("SELECT id, email, phone, password_hash FROM users WHERE email = ?")
    .get("owner-a@example.test");
  assert.ok(storedA.password_hash.startsWith("pbkdf2-sha256$v=1$i="));
  assert.notEqual(storedA.password_hash, "Secure-pass-123");
  assert.equal(storedA.phone, "+8613800000001");
  const storedSession = database
    .prepare("SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(storedA.id);
  assert.ok(storedSession.token_hash);
  assert.ok(!ownerACookie.includes(storedSession.token_hash));

  const duplicateEmail = await api("/api/auth/register", {
    method: "POST",
    body: {
      display_name: "Duplicate",
      email: "owner-a@example.test",
      phone: "+8613800000003",
      password: "Secure-pass-123",
      confirm_password: "Secure-pass-123",
    },
  });
  assert.equal(duplicateEmail.payload.error.code, "EMAIL_ALREADY_EXISTS");

  const duplicatePhone = await api("/api/auth/register", {
    method: "POST",
    body: {
      display_name: "Duplicate",
      email: "other@example.test",
      phone: "+8613800000001",
      password: "Secure-pass-123",
      confirm_password: "Secure-pass-123",
    },
  });
  assert.equal(duplicatePhone.payload.error.code, "PHONE_ALREADY_EXISTS");

  const wrong = await login("owner-a@example.test", "wrong-password");
  const absent = await login("absent@example.test", "wrong-password");
  assert.equal(wrong.payload.error.code, "INVALID_CREDENTIALS");
  assert.equal(absent.payload.error.code, "INVALID_CREDENTIALS");
  assert.equal(wrong.payload.error.message, absent.payload.error.message);

  const current = await api("/api/auth/session", { cookie: ownerACookie });
  assert.equal(current.response.status, 200);
  assert.equal(current.payload.data.user.email, "owner-a@example.test");

  const logout = await api("/api/auth/logout", { cookie: ownerACookie, method: "POST" });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await api("/api/auth/session", { cookie: ownerACookie })).response.status, 401);

  let relogin = await login("+8613800000001");
  assert.equal(relogin.response.status, 200);
  ownerACookie = relogin.response.headers.get("set-cookie").split(";", 1)[0];

  database.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run("2000-01-01T00:00:00.000Z", storedA.id);
  const expired = await api("/api/auth/session", { cookie: ownerACookie });
  assert.equal(expired.payload.error.code, "SESSION_EXPIRED");

  relogin = await login("owner-a@example.test");
  ownerACookie = relogin.response.headers.get("set-cookie").split(";", 1)[0];
  database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), storedA.id);
  assert.equal((await api("/api/auth/session", { cookie: ownerACookie })).response.status, 401);

  relogin = await login("owner-a@example.test");
  ownerACookie = relogin.response.headers.get("set-cookie").split(";", 1)[0];
  ownerBCookie = await register("owner-b@example.test", "+8613800000002", "Owner B");

  const previousWorker = worker;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("auth-restart-test", `${process.pid}-${Date.now()}`);
  ({ default: worker } = await import(workerUrl.href));
  assert.notEqual(worker, previousWorker);
  assert.equal((await api("/api/auth/session", { cookie: ownerACookie })).response.status, 200);
});

test("M4 APIs reject anonymous access and isolate project resources", { skip: !enabled }, async () => {
  const anonymous = await api("/api/m4/projects");
  assert.equal(anonymous.response.status, 401);

  const forgedHeader = await api("/api/m4/projects", {
    headers: { "oai-authenticated-user-email": "forged@example.test" },
  });
  assert.equal(forgedHeader.response.status, 401);

  const created = await api("/api/m4/projects", {
    cookie: ownerACookie,
    method: "POST",
    body: {
      primaryCreationMethod: "idea",
      goal: "研究 AI 生成英语阅读材料的难度",
      materialsSummary: "课程要求和三篇文献",
      firstAiHelp: "先判断题目是否可做",
      idempotencyKey: "ignored-body-key",
      user_id: "forged-owner-b",
    },
  });
  assert.equal(created.response.status, 201);
  const projectId = created.payload.data.project.id;

  const ownerList = await api("/api/m4/projects", {
    cookie: ownerACookie,
  });
  assert.equal(ownerList.payload.data.length, 1);
  const otherList = await api("/api/m4/projects", {
    cookie: ownerBCookie,
  });
  assert.equal(otherList.payload.data.length, 0);
  const crossed = await api(`/api/m4/projects/${projectId}/materials`, {
    cookie: ownerBCookie,
  });
  assert.equal(crossed.response.status, 404);
});

test("M4 diagnosis confirmation gate creates immutable confirmed versions", { skip: !enabled }, async () => {
  const created = await api("/api/m4/projects", {
    cookie: ownerACookie,
    method: "POST",
    body: {
      primaryCreationMethod: "idea",
      onboardingMode: "guided",
      goal: "研究数字平台中的知识协作机制",
      materialsSummary: "暂时没有材料",
      firstAiHelp: "先帮助梳理研究问题",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.data.project.primaryCreationMethod, "idea");
  assert.equal(created.payload.data.project.onboardingMode, "guided");
  const projectId = created.payload.data.project.id;
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM diagnosis_cards WHERE project_id = ?").get(projectId).count, 0);

  async function createAndConfirmCandidate(title) {
    const started = await api(`/api/m4/projects/${projectId}/diagnosis`, {
      cookie: ownerACookie,
      method: "POST",
      body: { action: "start", mode: "guided", depth: "standard" },
    });
    assert.equal(started.response.status, 201);
    const sessionId = started.payload.data.session.id;
    const saved = await api(`/api/m4/projects/${projectId}/diagnosis`, {
      cookie: ownerACookie,
      method: "POST",
      body: {
        action: "save_fields",
        session_id: sessionId,
        fields: [{
          field: "formal_title",
          label: "正式题目",
          value: title,
          status: "AI_INFERRED",
          source_type: "AI_RECOMMENDED",
          source_material_ids: [],
          source_locations: [],
          confidence: "MEDIUM",
          requires_confirmation: true,
          rationale: "候选题目，等待用户确认。",
        }, {
          field: "data_source",
          label: "数据与研究对象",
          value: "20 名互联网行业从业者访谈",
          status: "AI_INFERRED",
          source_type: "AI_RECOMMENDED",
          source_material_ids: [],
          source_locations: [],
          confidence: "MEDIUM",
          requires_confirmation: true,
          rationale: "候选研究对象，等待用户确认。",
        }],
      },
    });
    assert.equal(saved.response.status, 200);
    const beforeFinish = database.prepare("SELECT COUNT(*) AS count FROM diagnosis_cards WHERE project_id = ?").get(projectId).count;
    const finished = await api(`/api/m4/projects/${projectId}/diagnosis`, {
      cookie: ownerACookie,
      method: "POST",
      body: { action: "finish", session_id: sessionId, stop_reason: "candidate_ready" },
    });
    assert.equal(finished.response.status, 201);
    assert.equal(finished.payload.data.session.output_diagnosis_card_id, null);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM diagnosis_cards WHERE project_id = ?").get(projectId).count, beforeFinish);
    const confirmed = await api(`/api/m4/projects/${projectId}/diagnosis`, {
      cookie: ownerACookie,
      method: "POST",
      body: { action: "confirm", session_id: sessionId },
    });
    assert.equal(confirmed.response.status, 201);
    return confirmed;
  }

  const v1 = await createAndConfirmCandidate("数字平台中的知识协作机制研究");
  assert.equal(v1.payload.data.versions[0].version_number, 1);
  assert.equal(v1.payload.data.versions[0].status, "confirmed");
  const v1Id = v1.payload.data.versions[0].id;
  assert.equal(
    database.prepare("SELECT title FROM projects WHERE id = ?").get(projectId).title,
    "数字平台中的知识协作机制研究",
  );
  assert.equal(
    database.prepare("SELECT research_object FROM diagnosis_cards WHERE id = ?").get(v1Id).research_object,
    "20 名互联网行业从业者访谈",
  );

  const v2 = await createAndConfirmCandidate("数字平台知识协作机制的演化研究");
  assert.equal(v2.payload.data.versions[0].version_number, 2);
  assert.equal(v2.payload.data.versions[0].status, "confirmed");
  const retainedV1 = database.prepare("SELECT status FROM diagnosis_cards WHERE id = ?").get(v1Id);
  assert.equal(retainedV1.status, "superseded");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM diagnosis_cards WHERE project_id = ?").get(projectId).count, 2);
  const confirmedField = database.prepare("SELECT status, source_type, rationale FROM diagnosis_field_values WHERE diagnosis_card_id = ? AND field_key = 'formal_title'").get(v2.payload.data.versions[0].id);
  assert.equal(confirmedField.status, "USER_CONFIRMED");
  assert.equal(confirmedField.source_type, "AI_RECOMMENDED");
  assert.equal(confirmedField.rationale, "候选题目，等待用户确认。");
});

test("M4 persists material, task, privacy, model metadata and PPT contracts without external calls", { skip: !enabled }, async () => {
  const projects = await api("/api/m4/projects", {
    cookie: ownerACookie,
  });
  const projectId = projects.payload.data[0].id;
  const material = await api(`/api/m4/projects/${projectId}/materials`, {
    cookie: ownerACookie,
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
    cookie: ownerACookie,
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
    cookie: ownerACookie,
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
    cookie: ownerACookie,
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
    cookie: ownerACookie,
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
    cookie: ownerACookie,
  });
  assert.equal(models.response.status, 200);
  assert.equal(models.payload.data.providers.length, 2);
  const plaintext = await api(`/api/m4/projects/${projectId}/model-configs`, {
    cookie: ownerACookie,
    method: "POST",
    body: { action: "credential", api_key: "must-not-be-accepted" },
  });
  assert.equal(plaintext.response.status, 400);
  assert.equal(plaintext.payload.error.code, "PLAINTEXT_KEY_REJECTED");

  const presentation = await api(`/api/m4/projects/${projectId}/presentations`, {
    cookie: ownerACookie,
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
