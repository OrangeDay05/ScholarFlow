import type { M3Actor } from "@/app/lib/m3-server-identity";
import {
  inferM8Columns,
  requiredM8MappingFields,
  validateM8StatisticalSpec,
  type M8DatasetRow,
  type M8StatisticalFigureSpec,
} from "@/app/lib/m8-figure-contracts";
import { buildM8PythonFigureCode } from "@/app/lib/m8-figure-code";
import { getM8FigureRunnerAdapter, type M8FigureRunnerAdapter } from "@/app/lib/m8-figure-runner";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export class M8FigureError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "FIGURE_NOT_FOUND" | "ASSET_NOT_FOUND" | "INVALID_INPUT" | "STORAGE_FAILED";
  constructor(code: M8FigureError["code"], message: string) { super(message); this.code = code; }
}

export type M8FigureRunView = {
  figureProjectId: string;
  figureVersionId: string;
  figureVersionNumber: number;
  dataSnapshotId: string;
  dataSnapshotReused: boolean;
  codeVersionId: string;
  codeVersionReused: boolean;
  codeMode: "managed" | "customized" | "forked";
  runRecordId: string;
  status: "succeeded" | "failed" | "timed_out" | "runner_unavailable";
  code: string;
  assets: Array<{ id: string; format: "png" | "svg" | "pdf" | "tiff"; width: number; height: number; dpi: number; contentHash: string; fileSize: number }>;
  errorType: string | null;
  errorMessage: string | null;
  stderr: string;
};

export async function listM8Figures(actor: M3Actor, requestedProjectId: string) {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const figures = await db.prepare(
    `SELECT id, title, figure_type, status, created_at, updated_at FROM figure_projects
      WHERE owner_user_id = ? AND project_id = ? ORDER BY updated_at DESC`,
  ).bind(context.userId, context.projectId).all();
  const runs = await db.prepare(
    `SELECT rr.id, rr.figure_project_id, rr.figure_version_id, rr.data_snapshot_id, rr.code_version_id,
            rr.status, rr.queued_at, rr.started_at, rr.finished_at, rr.error_type, rr.error_message,
            ds.data_hash, ds.row_count, cv.code_hash, cv.code_mode,
            GROUP_CONCAT(fa.id || ':' || fa.format) AS assets
       FROM figure_run_records rr
       JOIN figure_data_snapshots ds ON ds.id = rr.data_snapshot_id
       JOIN figure_code_versions cv ON cv.id = rr.code_version_id
       LEFT JOIN figure_assets fa ON fa.run_record_id = rr.id
      WHERE rr.owner_user_id = ? AND rr.project_id = ?
      GROUP BY rr.id ORDER BY rr.queued_at DESC LIMIT 100`,
  ).bind(context.userId, context.projectId).all();
  return { projectId: context.projectId, figures: figures.results ?? [], runs: runs.results ?? [] };
}

export async function runM8Figure(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    figureProjectId?: string;
    specification: M8StatisticalFigureSpec;
    data: M8DatasetRow[];
    code?: string;
    sourceType?: "manual" | "upload" | "project_material";
    originalFilename?: string;
  },
  runner: M8FigureRunnerAdapter = getM8FigureRunnerAdapter(),
  storage: StorageAdapter = getMaterialStorageAdapter(),
): Promise<M8FigureRunView> {
  const columns = inferM8Columns(input.data);
  const errors = validateM8StatisticalSpec(input.specification, columns);
  if (input.data.length < 1 || input.data.length > 10_000) errors.push("数据行数必须在 1—10000 之间。");
  if (errors.length) throw new M8FigureError("INVALID_INPUT", errors.join("；"));
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const figure = await resolveOrCreateFigure(db, context, input.figureProjectId, input.specification);
  const dataBytes = new TextEncoder().encode(JSON.stringify(input.data));
  const dataHash = await sha256Hex(dataBytes);
  const snapshot = await resolveOrCreateSnapshot(db, storage, context, figure.id, {
    bytes: dataBytes,
    dataHash,
    columns,
    rowCount: input.data.length,
    sourceType: input.sourceType ?? "manual",
    originalFilename: input.originalFilename,
  });
  const generatedCode = buildM8PythonFigureCode(input.specification);
  const code = input.code?.trim() || generatedCode;
  const codeHash = await sha256Text(code);
  const parentCodeVersionId = await latestCodeVersionId(db, context, figure.id);
  const codeVersion = await resolveOrCreateCodeVersion(db, context, figure.id, {
    code,
    codeHash,
    codeMode: input.code?.trim() ? (parentCodeVersionId ? "forked" : "customized") : "managed",
    parentVersionId: input.code?.trim() ? parentCodeVersionId : null,
  });
  const figureVersion = await resolveOrCreateFigureSpecVersion(db, context, figure.id, input.specification, snapshot.id);
  const runRecordId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO figure_run_records (
       id, owner_user_id, project_id, figure_project_id, figure_version_id, data_snapshot_id,
       code_version_id, execution_mode, runner_id, status, started_at, timeout_seconds, created_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', CURRENT_TIMESTAMP, 30, ?)`,
  ).bind(
    runRecordId, context.userId, context.projectId, figure.id, figureVersion.id, snapshot.id,
    codeVersion.id, runner.mode, runner.runnerId, context.userId,
  ).run();

  let execution;
  try {
    execution = await runner.execute({
      runId: runRecordId,
      code,
      data: input.data,
      requiredColumns: mappedColumns(input.specification),
      timeoutSeconds: 30,
      formats: input.specification.publication.outputFormats,
    });
  } catch {
    const message = "本地绘图执行器不可用。数据快照、代码版本和运行记录已保留，可稍后重试。";
    await completeRun(db, context, runRecordId, { status: "runner_unavailable", runnerVersion: null, pythonVersion: null, dependencies: {}, stdout: "", stderr: "", errorType: "RUNNER_UNAVAILABLE", errorMessage: message, exitCode: null });
    await updateFigureStatus(db, context, figure.id, "failed");
    return view(figure.id, figureVersion, snapshot, codeVersion, runRecordId, "runner_unavailable", code, [], "RUNNER_UNAVAILABLE", message, "");
  }

  const assets: M8FigureRunView["assets"] = [];
  if (execution.status === "succeeded") {
    for (const output of execution.outputs) {
      const bytes = decodeBase64(output.base64);
      const hash = await sha256Hex(bytes);
      const assetId = crypto.randomUUID();
      const objectKey = `users/${context.userId}/projects/${context.projectId}/figures/${figure.id}/runs/${runRecordId}/${assetId}.${output.format}`;
      try {
        await storage.put(objectKey, bytes.buffer as ArrayBuffer, { contentType: figureContentType(output.format), contentHash: hash });
        await db.prepare(
          `INSERT INTO figure_assets (
             id, owner_user_id, project_id, figure_project_id, figure_version_id, run_record_id,
             format, object_key, content_hash, file_size, width, height, dpi
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(assetId, context.userId, context.projectId, figure.id, figureVersion.id, runRecordId, output.format, objectKey, hash, bytes.byteLength, output.width, output.height, input.specification.publication.dpi).run();
        assets.push({ id: assetId, format: output.format, width: output.width, height: output.height, dpi: input.specification.publication.dpi, contentHash: hash, fileSize: bytes.byteLength });
      } catch {
        await storage.delete(objectKey).catch(() => undefined);
        execution = { ...execution, status: "failed" as const, errorType: "STORAGE_FAILED", errorMessage: "图件已生成，但资产保存失败。", outputs: [] };
        break;
      }
    }
  }
  const status = execution.status;
  await completeRun(db, context, runRecordId, execution);
  await updateFigureStatus(db, context, figure.id, status === "succeeded" ? "ready" : "failed");
  return view(figure.id, figureVersion, snapshot, codeVersion, runRecordId, status, code, assets, execution.errorType, execution.errorMessage, execution.stderr);
}

export async function getM8FigureAsset(actor: M3Actor, requestedProjectId: string, assetId: string, storage: StorageAdapter = getMaterialStorageAdapter()) {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const asset = await db.prepare(
    "SELECT object_key, format FROM figure_assets WHERE id = ? AND owner_user_id = ? AND project_id = ?",
  ).bind(assetId, context.userId, context.projectId).first<{ object_key: string | null; format: string }>();
  if (!asset?.object_key) throw new M8FigureError("ASSET_NOT_FOUND", "图件资产不存在或不属于当前用户。");
  const body = await storage.get(asset.object_key);
  if (!body) throw new M8FigureError("ASSET_NOT_FOUND", "图件资产文件不存在。");
  return { body, contentType: figureContentType(asset.format), format: asset.format };
}

function figureContentType(format: string) {
  return ({ png: "image/png", svg: "image/svg+xml", pdf: "application/pdf", tiff: "image/tiff" } as Record<string, string>)[format] ?? "application/octet-stream";
}

async function resolveOrCreateFigure(db: D1Database, context: Context, requestedId: string | undefined, spec: M8StatisticalFigureSpec) {
  if (requestedId) {
    const existing = await db.prepare("SELECT id FROM figure_projects WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(requestedId, context.userId, context.projectId).first<{ id: string }>();
    if (!existing) throw new M8FigureError("FIGURE_NOT_FOUND", "图件不存在或不属于当前用户。");
    return existing;
  }
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO figure_projects (id, owner_user_id, project_id, title, figure_type, status) VALUES (?, ?, ?, ?, ?, 'draft')")
    .bind(id, context.userId, context.projectId, spec.title, spec.chartType).run();
  return { id };
}

async function resolveOrCreateSnapshot(db: D1Database, storage: StorageAdapter, context: Context, figureId: string, input: { bytes: Uint8Array; dataHash: string; columns: unknown[]; rowCount: number; sourceType: string; originalFilename?: string }) {
  const existing = await db.prepare("SELECT id, object_key FROM figure_data_snapshots WHERE figure_project_id = ? AND data_hash = ? AND owner_user_id = ? AND project_id = ?")
    .bind(figureId, input.dataHash, context.userId, context.projectId).first<{ id: string; object_key: string }>();
  if (existing) return { ...existing, reused: true };
  const id = crypto.randomUUID();
  const objectKey = `users/${context.userId}/projects/${context.projectId}/figures/${figureId}/data/${id}.json`;
  try { await storage.put(objectKey, input.bytes.buffer as ArrayBuffer, { contentType: "application/json", contentHash: input.dataHash }); }
  catch { throw new M8FigureError("STORAGE_FAILED", "数据快照保存失败，未创建运行记录。"); }
  try {
    await db.prepare(
      `INSERT INTO figure_data_snapshots (id, owner_user_id, project_id, figure_project_id, source_type, original_filename, object_key, columns_schema_json, row_count, data_hash, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, context.userId, context.projectId, figureId, input.sourceType, input.originalFilename ?? null, objectKey, JSON.stringify(input.columns), input.rowCount, input.dataHash, context.userId).run();
  } catch (error) { await storage.delete(objectKey).catch(() => undefined); throw error; }
  return { id, object_key: objectKey, reused: false };
}

async function resolveOrCreateCodeVersion(db: D1Database, context: Context, figureId: string, input: { code: string; codeHash: string; codeMode: "managed" | "customized" | "forked"; parentVersionId: string | null }) {
  const existing = await db.prepare("SELECT id, code_mode FROM figure_code_versions WHERE figure_project_id = ? AND code_hash = ? AND owner_user_id = ? AND project_id = ?")
    .bind(figureId, input.codeHash, context.userId, context.projectId).first<{ id: string; code_mode: "managed" | "customized" | "forked" }>();
  if (existing) return { id: existing.id, mode: existing.code_mode, reused: true };
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO figure_code_versions (id, owner_user_id, project_id, figure_project_id, language, engine, code, code_hash, code_mode, parent_version_id, created_by_user_id)
     VALUES (?, ?, ?, ?, 'python', 'matplotlib', ?, ?, ?, ?, ?)`,
  ).bind(id, context.userId, context.projectId, figureId, input.code, input.codeHash, input.codeMode, input.parentVersionId, context.userId).run();
  return { id, mode: input.codeMode, reused: false };
}

async function resolveOrCreateFigureSpecVersion(db: D1Database, context: Context, figureId: string, spec: M8StatisticalFigureSpec, snapshotId: string) {
  const specificationJson = JSON.stringify({ kind: spec.kind, chartType: spec.chartType, title: spec.title, xLabel: spec.xLabel, yLabel: spec.yLabel, errorType: spec.errorType, referenceLine: spec.referenceLine });
  const mappingJson = JSON.stringify(spec.mapping);
  const publicationJson = JSON.stringify(spec.publication);
  const latest = await db.prepare("SELECT id, version_number, specification_json, mapping_json, publication_json FROM figure_versions WHERE figure_project_id = ? AND owner_user_id = ? AND project_id = ? ORDER BY version_number DESC LIMIT 1")
    .bind(figureId, context.userId, context.projectId).first<{ id: string; version_number: number; specification_json: string; mapping_json: string; publication_json: string }>();
  if (latest && latest.specification_json === specificationJson && latest.mapping_json === mappingJson && latest.publication_json === publicationJson) return { id: latest.id, versionNumber: latest.version_number };
  const id = crypto.randomUUID();
  const versionNumber = (latest?.version_number ?? 0) + 1;
  await db.prepare(
    `INSERT INTO figure_versions (id, owner_user_id, project_id, figure_project_id, version_number, source_version_id, source_data_ref, spec_kind, specification_json, mapping_json, publication_json, caption)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'statistical', ?, ?, ?, ?)`,
  ).bind(id, context.userId, context.projectId, figureId, versionNumber, latest?.id ?? null, snapshotId, specificationJson, mappingJson, publicationJson, spec.caption).run();
  return { id, versionNumber };
}

async function completeRun(db: D1Database, context: Context, runId: string, execution: { status: string; runnerVersion: string | null; pythonVersion: string | null; dependencies: Record<string, string>; stdout: string; stderr: string; errorType: string | null; errorMessage: string | null; exitCode: number | null }) {
  const dependencyHash = Object.keys(execution.dependencies).length ? await sha256Text(JSON.stringify(execution.dependencies)) : null;
  await db.prepare(
    `UPDATE figure_run_records SET status = ?, runner_version = ?, python_version = ?, dependencies_json = ?, dependency_lock_hash = ?,
       finished_at = ?, exit_code = ?, stdout = ?, stderr = ?, error_type = ?, error_message = ?
     WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(execution.status, execution.runnerVersion, execution.pythonVersion, JSON.stringify(execution.dependencies), dependencyHash, new Date().toISOString(), execution.exitCode, clip(execution.stdout), clip(execution.stderr), execution.errorType, execution.errorMessage, runId, context.userId, context.projectId).run();
}

async function updateFigureStatus(db: D1Database, context: Context, figureId: string, status: "ready" | "failed") {
  await db.prepare("UPDATE figure_projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?")
    .bind(status, figureId, context.userId, context.projectId).run();
}

function mappedColumns(spec: M8StatisticalFigureSpec): string[] {
  const mapping = spec.mapping as Record<string, unknown>;
  const direct = requiredM8MappingFields(spec.chartType).flatMap((field) => {
    const value = mapping[field];
    if (typeof value === "string") return [value];
    if (field === "variables" && Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return [];
  });
  const panels = Array.isArray(mapping.panelSpecs)
    ? mapping.panelSpecs.flatMap((panel) => panel && typeof panel === "object" && "mapping" in panel
      ? Object.values((panel as { mapping: Record<string, unknown> }).mapping).filter((item): item is string => typeof item === "string")
      : [])
    : [];
  return [...new Set([...direct, ...panels])];
}

function view(figureProjectId: string, figureVersion: { id: string; versionNumber: number }, snapshot: { id: string; reused: boolean }, codeVersion: { id: string; reused: boolean; mode: "managed" | "customized" | "forked" }, runRecordId: string, status: M8FigureRunView["status"], code: string, assets: M8FigureRunView["assets"], errorType: string | null, errorMessage: string | null, stderr: string): M8FigureRunView {
  return { figureProjectId, figureVersionId: figureVersion.id, figureVersionNumber: figureVersion.versionNumber, dataSnapshotId: snapshot.id, dataSnapshotReused: snapshot.reused, codeVersionId: codeVersion.id, codeVersionReused: codeVersion.reused, codeMode: codeVersion.mode, runRecordId, status, code, assets, errorType, errorMessage, stderr: clip(stderr) };
}

async function latestCodeVersionId(db: D1Database, context: Context, figureId: string): Promise<string | null> {
  return db.prepare("SELECT id FROM figure_code_versions WHERE figure_project_id = ? AND owner_user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(figureId, context.userId, context.projectId).first<string>("id");
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> {
  if (!requestedProjectId || requestedProjectId === "demo") throw new M8FigureError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>();
  if (!project) throw new M8FigureError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: actor.userId, projectId: project.id };
}

async function sha256Text(value: string) { return sha256Hex(new TextEncoder().encode(value)); }
async function sha256Hex(value: Uint8Array) { const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function decodeBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function clip(value: string) { return value.slice(-8_000); }
