import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildMaterialObjectKey,
  inspectMaterialFile,
  MAX_MATERIAL_UPLOAD_BYTES,
} from "../app/lib/material-upload-security.ts";
import {
  InMemoryStorageAdapter,
  LocalDevelopmentObjectStorageAdapter,
} from "../app/lib/storage/storage-adapter.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const pdf = bytes("%PDF-1.7\n");
const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]);

test("InMemory Storage Adapter supports immutable put/get/head/delete", async () => {
  const adapter = new InMemoryStorageAdapter();
  const body = bytes("hello").buffer;
  const stored = await adapter.put("users/u/projects/p/materials/m/original/o", body, {
    contentType: "text/plain",
    contentHash: "hash-1",
  });
  assert.equal(stored.size, 5);
  assert.equal(stored.storageProvider, "IN_MEMORY");
  assert.ok(stored.createdAt);
  assert.equal((await adapter.head(stored.objectKey)).etag, "hash-1");
  assert.equal(await adapter.exists(stored.objectKey), true);
  assert.equal(new TextDecoder().decode(await adapter.get(stored.objectKey)), "hello");
  await assert.rejects(() => adapter.put(stored.objectKey, body, { contentType: "text/plain", contentHash: "hash-2" }));
  await adapter.delete(stored.objectKey);
  assert.equal(await adapter.head(stored.objectKey), null);
  assert.equal(await adapter.exists(stored.objectKey), false);
});

test("Local R2 Adapter follows the same immutable contract and survives adapter restart", async () => {
  const bucket = new FakeR2Bucket();
  const key = "users/u/projects/p/materials/m/original/o";
  const first = new LocalDevelopmentObjectStorageAdapter(bucket);
  await first.put(key, bytes("persistent").buffer, {
    contentType: "text/plain",
    contentHash: "persistent-hash",
  });
  const restarted = new LocalDevelopmentObjectStorageAdapter(bucket);
  assert.equal(new TextDecoder().decode(await restarted.get(key)), "persistent");
  await assert.rejects(() => restarted.put(key, bytes("overwrite").buffer, {
    contentType: "text/plain",
    contentHash: "other",
  }));
});

test("server object keys exclude filenames and reject injected components", () => {
  const key = buildMaterialObjectKey({ ownerUserId: "user-1", projectId: "project-1", materialId: "material-1", objectId: "object-1" });
  assert.equal(key, "users/user-1/projects/project-1/materials/material-1/original/object-1");
  assert.doesNotMatch(key, /\.pdf|\\|\.\./u);
  assert.throws(() => buildMaterialObjectKey({ ownerUserId: "../user", projectId: "project-1", materialId: "material-1", objectId: "object-1" }));
});

const legalCases = [
  ["paper.pdf", "application/pdf", pdf, "application/pdf"],
  ["draft.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["notes.txt", "text/plain", bytes("研究笔记"), "text/plain"],
  ["data.csv", "text/csv", bytes("id,value\n1,2\n"), "text/csv"],
  ["table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["photo.jpg", "image/jpeg", jpg, "image/jpeg"],
  ["figure.png", "image/png", png, "image/png"],
  ["refs.bib", "application/x-bibtex", bytes("@article{one, title={Test}}"), "application/x-bibtex"],
  ["refs.ris", "application/x-research-info-systems", bytes("TY  - JOUR\nTI  - Test\nER  -\n"), "application/x-research-info-systems"],
];

for (const [filename, clientContentType, content, expected] of legalCases) {
  test(`accepts safe ${filename} without parsing its body`, () => {
    const result = inspectMaterialFile({ filename, clientContentType, bytes: content });
    assert.equal(result.detectedContentType, expected);
  });
}

test("rejects empty files", () => {
  assert.throws(() => inspectMaterialFile({ filename: "empty.txt", clientContentType: "text/plain", bytes: new Uint8Array() }), /为空/u);
});

test("rejects files beyond the hard size limit", () => {
  assert.throws(() => inspectMaterialFile({ filename: "large.txt", clientContentType: "text/plain", bytes: new Uint8Array(MAX_MATERIAL_UPLOAD_BYTES + 1).fill(65) }), /超过/u);
});

test("rejects unsupported legacy DOC and XLS", () => {
  assert.throws(() => inspectMaterialFile({ filename: "legacy.doc", clientContentType: "application/msword", bytes: bytes("legacy") }), /仅支持/u);
  assert.throws(() => inspectMaterialFile({ filename: "legacy.xls", clientContentType: "application/vnd.ms-excel", bytes: bytes("legacy") }), /仅支持/u);
});

test("rejects extension and magic-byte conflicts", () => {
  assert.throws(() => inspectMaterialFile({ filename: "fake.pdf", clientContentType: "application/pdf", bytes: png }), /内容特征/u);
});

test("rejects forged client MIME", () => {
  assert.throws(() => inspectMaterialFile({ filename: "paper.pdf", clientContentType: "image/png", bytes: pdf }), /浏览器声明/u);
});

test("normalizes unusual display characters without changing storage keys", () => {
  const result = inspectMaterialFile({ filename: "研究：笔记.txt", clientContentType: "text/plain", bytes: bytes("hello") });
  assert.equal(result.normalizedFilename, "研究_笔记.txt");
});

test("rejects path traversal, separators and control characters", () => {
  for (const filename of ["../paper.pdf", "folder\\paper.pdf", "bad\u0000.txt"]) {
    assert.throws(() => inspectMaterialFile({ filename, clientContentType: "application/pdf", bytes: pdf }), /文件名/u);
  }
});

test("rejects executable signatures even behind an allowed extension", () => {
  assert.throws(() => inspectMaterialFile({ filename: "danger.txt", clientContentType: "text/plain", bytes: Uint8Array.from([0x4d, 0x5a, 1, 2]) }), /可执行/u);
});

test("does not inspect ZIP contents, execute macros, run OCR or claim parsed state", async () => {
  const security = await readFile(new URL("../app/lib/material-upload-security.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/m5/projects/[projectId]/materials/route.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../db/repositories/m5-material-uploads.ts", import.meta.url), "utf8");
  assert.doesNotMatch(security, /unzip|ocr|macro|formula|script\s*\(/iu);
  assert.doesNotMatch(route, /READY_FOR_KNOWLEDGE_BASE|PARSED/u);
  assert.match(repository, /awaiting_parse/iu);
});

const apiEnabled = process.env.M5_STORAGE_API_INTEGRATION === "true";
let worker;
let database;
let bucket;
let ownerACookie;
let ownerBCookie;
let projectId;

test("M5 upload API enforces auth, ownership, idempotency and AWAITING_PARSE", { skip: !apiEnabled }, async () => {
  await setupApi();
  assert.equal((await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", form: uploadForm("paper.pdf", pdf, "application/pdf") })).response.status, 401);
  assert.equal((await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", cookie: ownerBCookie, form: uploadForm("paper.pdf", pdf, "application/pdf"), idempotencyKey: "cross-user-1" })).response.status, 404);

  const first = await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", cookie: ownerACookie, form: uploadForm("paper.pdf", pdf, "application/pdf"), idempotencyKey: "upload-safe-1" });
  assert.equal(first.response.status, 201, JSON.stringify(first.payload));
  assert.equal(first.payload.data.snapshot.objectStatus, "STORED");
  assert.equal(first.payload.data.snapshot.materialStatus, "awaiting_parse");
  assert.equal(first.payload.data.snapshot.projectId, projectId);
  assert.ok(first.payload.data.snapshot.contentHash);
  assert.equal("objectKey" in first.payload.data.snapshot, false);
  assert.doesNotMatch(JSON.stringify(first.payload), /\.wrangler|[A-Z]:\\/iu);

  const replay = await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", cookie: ownerACookie, form: uploadForm("paper.pdf", pdf, "application/pdf"), idempotencyKey: "upload-safe-1" });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.payload.data.replayed, true);
  assert.equal(database.prepare("SELECT count(*) AS total FROM material_objects WHERE idempotency_key = ?").get("upload-safe-1").total, 1);

  const list = await api(`/api/m5/projects/${projectId}/materials`, { cookie: ownerACookie });
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.data.length, 1);
  assert.equal((await api(`/api/m5/projects/${projectId}/materials`, { cookie: ownerBCookie })).response.status, 404);
});

test("M5 upload API records storage failures without successful states", { skip: !apiEnabled }, async () => {
  await setupApi();
  bucket.failNextPut = true;
  const failed = await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", cookie: ownerACookie, form: uploadForm("fail.pdf", pdf, "application/pdf"), idempotencyKey: "storage-fail-1" });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.payload.error.code, "STORAGE_WRITE_FAILED");
  const row = database.prepare("SELECT status FROM material_objects WHERE idempotency_key = ?").get("storage-fail-1");
  assert.equal(row.status, "UPLOAD_FAILED");
});

test("M5 upload API deletes a just-written object when final DB confirmation fails", { skip: !apiEnabled }, async () => {
  await setupApi();
  databaseAdapter.failStoredUpdateOnce = true;
  const failed = await api(`/api/m5/projects/${projectId}/materials`, { method: "POST", cookie: ownerACookie, form: uploadForm("db-fail.pdf", pdf, "application/pdf"), idempotencyKey: "database-fail-1" });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.payload.error.code, "DATABASE_WRITE_FAILED");
  assert.equal(bucket.objects.size, 1);
  const row = database.prepare("SELECT status FROM material_objects WHERE idempotency_key = ?").get("database-fail-1");
  assert.equal(row.status, "UPLOAD_FAILED");
});

test("0006 is additive and establishes soft-delete and audit foundations", async () => {
  const migration = await readFile(new URL("../drizzle/0006_hot_professor_monster.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `material_objects`/u);
  assert.match(migration, /CREATE TABLE `material_storage_events`/u);
  assert.match(migration, /`deleted_at` text/u);
  assert.match(migration, /`retention_status` text/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/iu);
});

class FakeR2Bucket {
  objects = new Map();
  failNextPut = false;
  async put(key, body, options) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("simulated storage failure");
    }
    const copy = body.slice(0);
    const object = { body: copy, size: copy.byteLength, etag: options.customMetadata.contentHash, httpMetadata: options.httpMetadata };
    this.objects.set(key, object);
    return object;
  }
  async head(key) { return this.objects.get(key) ?? null; }
  async get(key) {
    const object = this.objects.get(key);
    return object ? { ...object, arrayBuffer: async () => object.body.slice(0) } : null;
  }
  async delete(key) { this.objects.delete(key); }
}

class PreparedStatement {
  constructor(adapter, sql, values = []) { this.adapter = adapter; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.adapter, this.sql, values); }
  async first(column) { const row = this.adapter.db.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; }
  async all() { return { success: true, results: this.adapter.db.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; }
  async run() {
    if (this.adapter.failStoredUpdateOnce && /UPDATE material_objects[\s\S]*status = 'STORED'/u.test(this.sql)) {
      this.adapter.failStoredUpdateOnce = false;
      throw new Error("simulated final database failure");
    }
    const result = this.adapter.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class D1DatabaseAdapter {
  failStoredUpdateOnce = false;
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

let databaseAdapter;
async function setupApi() {
  if (worker) return;
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0000_swift_blue_shield.sql", "0001_vengeful_tigra.sql", "0002_petite_sir_ram.sql", "0003_condemned_magik.sql", "0004_nervous_maddog.sql", "0005_freezing_nextwave.sql", "0006_hot_professor_monster.sql"]) {
    database.exec((await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  databaseAdapter = new D1DatabaseAdapter(database);
  bucket = new FakeR2Bucket();
  workerEnv.DB = databaseAdapter;
  workerEnv.MATERIALS = bucket;
  ({ default: worker } = await import(new URL(`../dist/server/index.js?m5-storage=${Date.now()}`, import.meta.url).href));
  ownerACookie = await register("storage-a@example.test", "+8613900000001");
  ownerBCookie = await register("storage-b@example.test", "+8613900000002");
  const created = await api("/api/m4/projects", { method: "POST", cookie: ownerACookie, json: { primaryCreationMethod: "data", goal: "材料上传测试", materialsSummary: "待上传", firstAiHelp: "先存储" } });
  assert.equal(created.response.status, 201, JSON.stringify(created.payload));
  projectId = created.payload.data.project.id;
}

async function api(pathname, { cookie, method = "GET", form, json, idempotencyKey } = {}) {
  const headers = new Headers({ accept: "application/json" });
  if (cookie) headers.set("cookie", cookie);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  let body;
  if (form) body = form;
  if (json) { headers.set("content-type", "application/json"); body = JSON.stringify(json); }
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { method, headers, body }), { DB: databaseAdapter, MATERIALS: bucket, ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  return { response, payload: await response.json() };
}

async function register(email, phone) {
  const result = await api("/api/auth/register", { method: "POST", json: { display_name: email, email, phone, password: "Secure-pass-123", confirm_password: "Secure-pass-123" } });
  assert.equal(result.response.status, 201);
  return result.response.headers.get("set-cookie").split(";", 1)[0];
}

function uploadForm(filename, content, type) {
  const form = new FormData();
  form.set("file", new File([content], filename, { type }));
  return form;
}

function bytes(value) { return new TextEncoder().encode(value); }

test.after(() => database?.close());
