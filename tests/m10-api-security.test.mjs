import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const enabled = process.env.M10_API_INTEGRATION === "true";
let worker;
let database;

test("M10 operations API rejects anonymous and normal users while auditing admin changes", { skip: !enabled }, async () => {
  await setup();
  const anonymous = await api("/api/m10/admin/operations");
  assert.equal(anonymous.response.status, 401, JSON.stringify(anonymous.payload));

  const userCookie = await register("user@example.test", "Normal User");
  const forbidden = await api("/api/m10/admin/operations", { cookie: userCookie });
  assert.equal(forbidden.response.status, 403);

  const adminCookie = await register("admin@example.test", "Admin User");
  const adminId = database.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.test").id;
  database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(adminId);
  const dashboard = await api("/api/m10/admin/operations", { cookie: adminCookie });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.payload.ok, true);

  const missingReason = await api("/api/m10/admin/operations", { cookie: adminCookie, method: "POST", body: { action: "update_flag", key: "m10.release_candidate", enabled: true, rollout_percentage: 10 } });
  assert.equal(missingReason.response.status, 400);
  const updated = await api("/api/m10/admin/operations", { cookie: adminCookie, method: "POST", body: { action: "update_flag", key: "m10.release_candidate", enabled: true, rollout_percentage: 10, reason: "发布候选灰度验证" } });
  assert.equal(updated.response.status, 200);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM admin_audit_logs WHERE actor_user_id = ?").get(adminId).total, 1);
});

test("M10 event API enforces authenticated project ownership", { skip: !enabled }, async () => {
  await setup();
  const cookie = await register("event-owner@example.test", "Event Owner");
  const ownerId = database.prepare("SELECT id FROM users WHERE email = ?").get("event-owner@example.test").id;
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("event-project", ownerId, "Event", "course_paper", "zh-CN", "idea", "active");
  const recorded = await api("/api/m10/events", { cookie, method: "POST", body: { project_id: "event-project", category: "NAVIGATION", event_name: "editor.opened", success: true, duration_ms: 80 } });
  assert.equal(recorded.response.status, 201);
  const blocked = await api("/api/m10/events", { cookie, method: "POST", body: { project_id: "other-project", category: "NAVIGATION", event_name: "editor.opened", success: true } });
  assert.equal(blocked.response.status, 404);
});

async function setup() {
  if (worker) return;
  database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON");
  const files = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
  for (const file of files) database.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  workerEnv.DB = new D1DatabaseAdapter(database);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("m10-api", `${process.pid}-${Date.now()}`); ({ default: worker } = await import(workerUrl.href));
}

async function register(email, displayName) {
  const phone = `1${String(Math.abs(hash(email))).padStart(10, "0").slice(0, 10)}`;
  const result = await api("/api/auth/register", { method: "POST", body: { display_name: displayName, email, phone, password: "Secure-pass-123", confirm_password: "Secure-pass-123" } });
  assert.equal(result.response.status, 201);
  return result.response.headers.get("set-cookie").split(";", 1)[0];
}

function hash(value) {
  let result = 0;
  for (const character of value) result = (result * 31 + character.codePointAt(0)) | 0;
  return result;
}

async function api(pathname, { cookie, method = "GET", body } = {}) {
  await setup(); const headers = new Headers({ accept: "application/json" }); if (cookie) headers.set("cookie", cookie); if (body !== undefined) headers.set("content-type", "application/json");
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { DB: new D1DatabaseAdapter(database), ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  return { response, payload: await response.json() };
}

class PreparedStatement { constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.db, this.sql, values); } async first(column) { const row = this.db.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(db) { this.db = db; } prepare(sql) { return new PreparedStatement(this.db, sql); } async batch(statements) { const results = []; for (const statement of statements) results.push(await statement.run()); return results; } }
