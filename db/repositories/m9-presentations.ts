import { unzipSync } from "fflate";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import type { M4PresentationScene } from "@/app/lib/m4-presentation-contracts";
import { validateM9DeckSpec, type M9DeckSpec, type M9SlideSpec } from "@/app/lib/m9-presentation-contracts";
import { getM9PptxRunnerAdapter, type M9PptxRunnerAdapter } from "@/app/lib/m9-pptx-runner";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };
export class M9PresentationError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "VERSION_NOT_FOUND" | "NOT_READY" | "INVALID_DECK" | "RUNNER_UNAVAILABLE" | "RENDER_FAILED" | "INVALID_PPTX" | "EXPORT_NOT_FOUND";
  constructor(code: M9PresentationError["code"], message: string) { super(message); this.code = code; }
}

export type M9PresentationExportView = { id: string; presentationVersionId: string; format: "pptx"; contentHash: string; fileSize: number; status: "GENERATED" | "OPEN_VERIFIED"; slideCount: number; runnerId: string; runnerVersion: string; artifactToolVersion: string };

export async function exportM9Presentation(
  actor: M3Actor,
  requestedProjectId: string,
  presentationVersionId: string,
  runner: M9PptxRunnerAdapter = getM9PptxRunnerAdapter(),
  storage: StorageAdapter = getMaterialStorageAdapter(),
): Promise<M9PresentationExportView> {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const deck = await loadDeck(db, context, presentationVersionId, storage);
  const errors = validateM9DeckSpec(deck);
  if (errors.length) throw new M9PresentationError("INVALID_DECK", errors.join("；"));
  let rendered;
  try { rendered = await runner.render({ runId: crypto.randomUUID(), deck, timeoutSeconds: 90 }); }
  catch { throw new M9PresentationError("RUNNER_UNAVAILABLE", "PPTX Runner 当前不可用，PresentationVersion 和页面内容已保留。"); }
  if (rendered.status !== "succeeded" || !rendered.pptxBase64) throw new M9PresentationError("RENDER_FAILED", rendered.errorMessage ?? "PPTX 生成失败。");
  const bytes = decodeBase64(rendered.pptxBase64);
  verifyPptx(bytes, deck.slides.length);
  const contentHash = await sha256Hex(bytes); const exportId = crypto.randomUUID();
  const objectKey = `users/${context.userId}/projects/${context.projectId}/presentations/${presentationVersionId}/${exportId}.pptx`;
  await storage.put(objectKey, bytes.buffer as ArrayBuffer, { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", contentHash });
  try {
    await db.prepare(`INSERT INTO presentation_exports
      (id, owner_user_id, project_id, presentation_version_id, format, object_key, content_hash, file_size, runner_id, runner_version, artifact_tool_version, status)
      VALUES (?, ?, ?, ?, 'pptx', ?, ?, ?, ?, ?, ?, 'GENERATED')`)
      .bind(exportId, context.userId, context.projectId, presentationVersionId, objectKey, contentHash, bytes.byteLength, rendered.runnerId, rendered.runnerVersion, rendered.artifactToolVersion).run();
  } catch (error) { await storage.delete(objectKey).catch(() => undefined); throw error; }
  return { id: exportId, presentationVersionId, format: "pptx", contentHash, fileSize: bytes.byteLength, status: "GENERATED", slideCount: deck.slides.length, runnerId: rendered.runnerId, runnerVersion: rendered.runnerVersion, artifactToolVersion: rendered.artifactToolVersion };
}

export async function getM9PresentationExport(actor: M3Actor, requestedProjectId: string, exportId: string, storage: StorageAdapter = getMaterialStorageAdapter()) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const row = await db.prepare("SELECT object_key FROM presentation_exports WHERE id = ? AND owner_user_id = ? AND project_id = ?")
    .bind(exportId, context.userId, context.projectId).first<{ object_key: string }>();
  if (!row) throw new M9PresentationError("EXPORT_NOT_FOUND", "PPTX 导出不存在或不属于当前用户。");
  const body = await storage.get(row.object_key); if (!body) throw new M9PresentationError("EXPORT_NOT_FOUND", "PPTX 文件不存在。");
  return body;
}

export async function markM9PresentationOpenVerified(actor: M3Actor, requestedProjectId: string, exportId: string) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const result = await db.prepare("UPDATE presentation_exports SET status = 'OPEN_VERIFIED', opened_verified_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?")
    .bind(exportId, context.userId, context.projectId).run();
  if (!result.meta?.changes) throw new M9PresentationError("EXPORT_NOT_FOUND", "PPTX 导出不存在或不属于当前用户。");
}

async function loadDeck(db: D1Database, context: Context, versionId: string, storage: StorageAdapter): Promise<M9DeckSpec> {
  const version = await db.prepare(`SELECT pv.id, pv.narrative_json, pp.title, pp.scene, pp.audience, pp.duration_minutes, pp.readiness_status
    FROM presentation_versions pv JOIN presentation_projects pp ON pp.id = pv.presentation_project_id
    WHERE pv.id = ? AND pv.owner_user_id = ? AND pv.project_id = ?`)
    .bind(versionId, context.userId, context.projectId).first<{ id: string; narrative_json: string; title: string; scene: M4PresentationScene; audience: string; duration_minutes: number | null; readiness_status: string }>();
  if (!version) throw new M9PresentationError("VERSION_NOT_FOUND", "PPT 版本不存在或不属于当前用户。");
  if (["BLOCKED", "NEEDS_MATERIAL", "NEEDS_CONTENT"].includes(version.readiness_status)) throw new M9PresentationError("NOT_READY", "当前 PPT 缺少必要内容或被真实性门阻断。");
  const rows = await db.prepare("SELECT position, title, content_json, speaker_notes, asset_bindings_json, source_bindings_json FROM slides WHERE presentation_version_id = ? AND owner_user_id = ? AND project_id = ? ORDER BY position")
    .bind(versionId, context.userId, context.projectId).all<{ position: number; title: string; content_json: string; speaker_notes: string; asset_bindings_json: string; source_bindings_json: string }>();
  if ((rows.results ?? []).length < 3) throw new M9PresentationError("NOT_READY", "至少需要三页已保存幻灯片才能导出 PPTX。");
  const slides: M9SlideSpec[] = [];
  for (const row of rows.results ?? []) {
    const content = jsonObject(row.content_json); const sources = jsonArray(row.source_bindings_json); const assetIds = jsonArray(row.asset_bindings_json);
    const body = Array.isArray(content.body) ? content.body.filter((item): item is string => typeof item === "string") : Array.isArray(content.bullets) ? content.bullets.filter((item): item is string => typeof item === "string") : typeof content.coreMessage === "string" ? [content.coreMessage] : [];
    const asset = await loadFirstImage(db, context, storage, assetIds);
    slides.push({ title: row.title, body, takeaway: typeof content.takeaway === "string" ? content.takeaway : undefined, speakerNotes: `${row.speaker_notes.trim()}\n\n[Sources]\n${sources.length ? sources.map((item) => `- ${item}`).join("\n") : "- 项目内内容；尚无外部来源绑定。"}`, sourceBindings: sources, asset });
  }
  const narrative = jsonObject(version.narrative_json);
  const qaPreparation = Array.isArray(narrative.qaPreparation) ? narrative.qaPreparation.flatMap((item) => item && typeof item === "object" && "question" in item && "answer" in item && typeof item.question === "string" && typeof item.answer === "string" ? [{ question: item.question, answer: item.answer }] : []) : [];
  return { title: version.title, subtitle: typeof narrative.subtitle === "string" ? narrative.subtitle : `${version.audience}研究汇报`, scene: version.scene, audience: version.audience || "学术听众", durationMinutes: version.duration_minutes ?? 15, language: "zh-CN", visualStyle: "scholar_green", slides, qaPreparation };
}

async function loadFirstImage(db: D1Database, context: Context, storage: StorageAdapter, ids: string[]): Promise<M9SlideSpec["asset"]> {
  for (const id of ids) {
    const row = await db.prepare("SELECT object_key, format FROM figure_assets WHERE id = ? AND owner_user_id = ? AND project_id = ? AND format IN ('png')")
      .bind(id, context.userId, context.projectId).first<{ object_key: string | null; format: string }>();
    if (!row?.object_key) continue; const bytes = await storage.get(row.object_key); if (!bytes) continue;
    return { contentType: "image/png", base64: encodeBase64(new Uint8Array(bytes)), alt: "项目科研图件" };
  }
  return undefined;
}

function verifyPptx(bytes: Uint8Array, expectedSlides: number) {
  if (!bytes.slice(0, 4).every((value, index) => value === [0x50, 0x4b, 0x03, 0x04][index])) throw new M9PresentationError("INVALID_PPTX", "Runner 产物不是有效的 OOXML ZIP。");
  let files: Record<string, Uint8Array>; try { files = unzipSync(bytes); } catch { throw new M9PresentationError("INVALID_PPTX", "PPTX ZIP 无法解包。"); }
  if (!files["[Content_Types].xml"] || !files["ppt/presentation.xml"]) throw new M9PresentationError("INVALID_PPTX", "PPTX 缺少核心 OOXML 文件。");
  const slideCount = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length;
  if (slideCount !== expectedSlides) throw new M9PresentationError("INVALID_PPTX", `PPTX 页数不一致：预期 ${expectedSlides}，实际 ${slideCount}。`);
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> { if (!requestedProjectId || requestedProjectId === "demo") throw new M9PresentationError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。"); const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>(); if (!project) throw new M9PresentationError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。"); return { userId: actor.userId, projectId: project.id }; }
function jsonObject(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function jsonArray(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function decodeBase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function encodeBase64(value: Uint8Array) { let binary = ""; for (let index = 0; index < value.length; index += 0x8000) binary += String.fromCharCode(...value.subarray(index, index + 0x8000)); return btoa(binary); }
async function sha256Hex(value: Uint8Array) { const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
