import type { M3Actor } from "@/app/lib/m3-server-identity";
import type { M8DiagramFigureSpec } from "@/app/lib/m8-figure-contracts";
import { buildM8DiagramMermaid, renderM8DiagramSvg, validateM8DiagramSpec } from "@/app/lib/m8-diagram-renderer";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";
import { M8FigureError } from "./m8-figures";

export type M8DiagramRunView = {
  figureProjectId: string;
  figureVersionId: string;
  figureVersionNumber: number;
  codeVersionId: string;
  runRecordId: string;
  asset: { id: string; format: "svg"; contentHash: string; fileSize: number };
  code: string;
};

export async function runM8Diagram(
  actor: M3Actor,
  requestedProjectId: string,
  input: { figureProjectId?: string; specification: M8DiagramFigureSpec },
  storage: StorageAdapter = getMaterialStorageAdapter(),
): Promise<M8DiagramRunView> {
  const errors = validateM8DiagramSpec(input.specification);
  if (errors.length) throw new M8FigureError("INVALID_INPUT", errors.join("；"));
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const figureId = input.figureProjectId ?? crypto.randomUUID();
  if (input.figureProjectId) {
    const row = await db.prepare("SELECT id FROM figure_projects WHERE id = ? AND owner_user_id = ? AND project_id = ?")
      .bind(figureId, context.userId, context.projectId).first<{ id: string }>();
    if (!row) throw new M8FigureError("FIGURE_NOT_FOUND", "概念图不存在或不属于当前用户。");
  } else {
    await db.prepare("INSERT INTO figure_projects (id, owner_user_id, project_id, title, figure_type, status) VALUES (?, ?, ?, ?, ?, 'draft')")
      .bind(figureId, context.userId, context.projectId, input.specification.title, input.specification.diagramType).run();
  }

  const sourceBytes = new TextEncoder().encode(JSON.stringify({ nodes: input.specification.nodes, edges: input.specification.edges }));
  const sourceHash = await sha256Hex(sourceBytes);
  const snapshot = await db.prepare("SELECT id FROM figure_data_snapshots WHERE figure_project_id = ? AND data_hash = ? AND owner_user_id = ? AND project_id = ?")
    .bind(figureId, sourceHash, context.userId, context.projectId).first<{ id: string }>();
  const snapshotId = snapshot?.id ?? crypto.randomUUID();
  if (!snapshot) {
    const sourceKey = `users/${context.userId}/projects/${context.projectId}/figures/${figureId}/data/${snapshotId}.json`;
    await storage.put(sourceKey, sourceBytes.buffer as ArrayBuffer, { contentType: "application/json", contentHash: sourceHash });
    await db.prepare(`INSERT INTO figure_data_snapshots
      (id, owner_user_id, project_id, figure_project_id, source_type, original_filename, object_key, columns_schema_json, row_count, data_hash, created_by_user_id)
      VALUES (?, ?, ?, ?, 'manual', 'diagram-source.json', ?, '[]', ?, ?, ?)`)
      .bind(snapshotId, context.userId, context.projectId, figureId, sourceKey, input.specification.nodes.length, sourceHash, context.userId).run();
  }

  const code = buildM8DiagramMermaid(input.specification);
  const codeHash = await sha256Text(code);
  const existingCode = await db.prepare("SELECT id FROM figure_code_versions WHERE figure_project_id = ? AND code_hash = ? AND owner_user_id = ? AND project_id = ?")
    .bind(figureId, codeHash, context.userId, context.projectId).first<{ id: string }>();
  const codeVersionId = existingCode?.id ?? crypto.randomUUID();
  if (!existingCode) {
    await db.prepare(`INSERT INTO figure_code_versions
      (id, owner_user_id, project_id, figure_project_id, language, engine, code, code_hash, code_mode, parent_version_id, created_by_user_id)
      VALUES (?, ?, ?, ?, 'mermaid', 'controlled_svg', ?, ?, 'managed', NULL, ?)`)
      .bind(codeVersionId, context.userId, context.projectId, figureId, code, codeHash, context.userId).run();
  }

  const latest = await db.prepare("SELECT id, version_number FROM figure_versions WHERE figure_project_id = ? AND owner_user_id = ? AND project_id = ? ORDER BY version_number DESC LIMIT 1")
    .bind(figureId, context.userId, context.projectId).first<{ id: string; version_number: number }>();
  const figureVersionId = crypto.randomUUID();
  const versionNumber = (latest?.version_number ?? 0) + 1;
  await db.prepare(`INSERT INTO figure_versions
    (id, owner_user_id, project_id, figure_project_id, version_number, source_version_id, source_data_ref, spec_kind, specification_json, mapping_json, publication_json, caption)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'diagram', ?, ?, ?, ?)`)
    .bind(figureVersionId, context.userId, context.projectId, figureId, versionNumber, latest?.id ?? null, snapshotId, JSON.stringify({ kind: input.specification.kind, diagramType: input.specification.diagramType, title: input.specification.title, renderer: input.specification.renderer }), JSON.stringify({ nodes: input.specification.nodes, edges: input.specification.edges }), JSON.stringify(input.specification.publication), input.specification.caption).run();

  const runRecordId = crypto.randomUUID();
  await db.prepare(`INSERT INTO figure_run_records
    (id, owner_user_id, project_id, figure_project_id, figure_version_id, data_snapshot_id, code_version_id, execution_mode, runner_id, runner_version, dependencies_json, status, started_at, finished_at, timeout_seconds, exit_code, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'disabled', 'controlled-svg-template', '1.0.0', '{}', 'succeeded', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 5, 0, ?)`)
    .bind(runRecordId, context.userId, context.projectId, figureId, figureVersionId, snapshotId, codeVersionId, context.userId).run();

  const svg = renderM8DiagramSvg(input.specification);
  const contentHash = await sha256Hex(svg);
  const assetId = crypto.randomUUID();
  const objectKey = `users/${context.userId}/projects/${context.projectId}/figures/${figureId}/runs/${runRecordId}/${assetId}.svg`;
  await storage.put(objectKey, svg.buffer as ArrayBuffer, { contentType: "image/svg+xml", contentHash });
  await db.prepare(`INSERT INTO figure_assets
    (id, owner_user_id, project_id, figure_project_id, figure_version_id, run_record_id, format, object_key, content_hash, file_size, width, height, dpi)
    VALUES (?, ?, ?, ?, ?, ?, 'svg', ?, ?, ?, 0, 0, 0)`)
    .bind(assetId, context.userId, context.projectId, figureId, figureVersionId, runRecordId, objectKey, contentHash, svg.byteLength).run();
  await db.prepare("UPDATE figure_projects SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?")
    .bind(figureId, context.userId, context.projectId).run();
  return { figureProjectId: figureId, figureVersionId, figureVersionNumber: versionNumber, codeVersionId, runRecordId, asset: { id: assetId, format: "svg", contentHash, fileSize: svg.byteLength }, code };
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string) {
  const project = requestedProjectId === "demo"
    ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(actor.userId).first<{ id: string }>()
    : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>();
  if (!project) throw new M8FigureError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: actor.userId, projectId: project.id };
}

async function sha256Text(value: string) { return sha256Hex(new TextEncoder().encode(value)); }
async function sha256Hex(value: Uint8Array) { const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
