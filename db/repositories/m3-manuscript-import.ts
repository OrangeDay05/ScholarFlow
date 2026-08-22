import type { M3Actor } from "@/app/lib/m3-server-identity";
import { assignManuscriptChunks } from "@/app/lib/manuscript-import-mapping";
import { documentToPlainText } from "@/app/lib/document-model/projection";
import type { DocumentContent } from "@/app/lib/document-model/types";
import { getD1 } from "../index";

type ImportChunk = { id: string; ordinal: number; text: string };
type ImportSection = { id: string; slug: string; title: string; position: number };

export type ManuscriptImportCandidate = {
  materialId: string;
  filename: string;
  parseRunId: string;
  chunkCount: number;
  structuredStats: Record<string, number> | null;
  warnings: string[];
  chunks: Array<{ id: string; ordinal: number; text: string; assignedSectionId: string }>;
  sections: Array<{
    sectionId: string;
    slug: string;
    title: string;
    chunkIds: string[];
    characterCount: number;
    preview: string;
    paragraphs: string[];
    proposed: boolean;
  }>;
  unassignedChunkIds: string[];
};

export class ManuscriptImportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function buildManuscriptImportCandidate(
  actor: M3Actor,
  projectId: string,
  requestedMaterialId?: string,
): Promise<ManuscriptImportCandidate> {
  const db = getD1();
  await requireProject(db, actor.userId, projectId);
  const material = await db.prepare(
    `SELECT id, filename FROM materials
     WHERE owner_user_id = ? AND project_id = ? AND kind = 'manuscript'
       AND status = 'success' AND (? IS NULL OR id = ?)
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(actor.userId, projectId, requestedMaterialId ?? null, requestedMaterialId ?? null)
    .first<{ id: string; filename: string }>();
  if (!material) throw new ManuscriptImportError("MANUSCRIPT_NOT_FOUND", "当前项目没有解析成功的初稿材料。");

  const parseRun = await db.prepare(
    `SELECT id FROM material_parse_runs
     WHERE owner_user_id = ? AND project_id = ? AND material_id = ? AND status = 'SUCCEEDED'
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(actor.userId, projectId, material.id).first<{ id: string }>();
  if (!parseRun) throw new ManuscriptImportError("PARSE_RUN_NOT_FOUND", "当前初稿没有可导入的成功解析版本。");

  const outline = await db.prepare(
    `SELECT id FROM outlines WHERE owner_user_id = ? AND project_id = ?
     ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, version_number DESC LIMIT 1`,
  ).bind(actor.userId, projectId).first<{ id: string }>();
  if (!outline) throw new ManuscriptImportError("OUTLINE_NOT_FOUND", "请先确认项目提纲，再导入初稿正文。");

  const [sectionResult, chunkResult] = await Promise.all([
    db.prepare(
      `SELECT id, slug, title, position FROM sections
       WHERE owner_user_id = ? AND project_id = ? AND outline_id = ? ORDER BY position`,
    ).bind(actor.userId, projectId, outline.id).all<ImportSection>(),
    db.prepare(
      `SELECT id, ordinal, text FROM material_chunks
       WHERE owner_user_id = ? AND project_id = ? AND material_id = ? AND parse_run_id = ? ORDER BY ordinal`,
    ).bind(actor.userId, projectId, material.id, parseRun.id).all<ImportChunk>(),
  ]);
  const sections = sectionResult.results ?? [];
  const chunks = chunkResult.results ?? [];
  const parsedDocument = await db.prepare(
    `SELECT content_json, stats_json, warnings_json FROM parsed_documents
     WHERE owner_user_id = ? AND project_id = ? AND material_id = ? AND parse_run_id = ? LIMIT 1`,
  ).bind(actor.userId, projectId, material.id, parseRun.id).first<{ content_json: string; stats_json: string; warnings_json: string }>();
  if (!sections.length) throw new ManuscriptImportError("OUTLINE_EMPTY", "当前提纲没有可接收正文的章节。");
  if (!chunks.length) throw new ManuscriptImportError("MANUSCRIPT_EMPTY", "当前初稿解析结果没有正文片段。");

  const frontSlugs = new Set(["front-matter", "abstract", "keywords"]);
  const bodySections = sections.filter((section) => !frontSlugs.has(section.slug));
  const mapping = assignManuscriptChunks(chunks, bodySections);
  const referencesIndex = sections.findIndex((section) => normalizeTitle(section.title) === "参考文献");
  const hasStandaloneReferences = referencesIndex >= 0;
  const mappedSections = sections.map((section) => {
    const bodyIndex = bodySections.findIndex((item) => item.id === section.id);
    const assigned = section.slug === "front-matter" ? mapping.frontMatter
      : section.slug === "abstract" ? mapping.abstract
        : section.slug === "keywords" ? mapping.keywords
          : sections.indexOf(section) === referencesIndex ? mapping.references
            : mapping.sections[bodyIndex] ?? [];
    const paragraphs = assigned.map((chunk) => chunk.text.trim()).filter(Boolean);
    const title = normalizeTitle(section.title) === "后续研究计划与参考文献" ? "后续研究计划" : section.title;
    return {
      sectionId: section.id,
      slug: section.slug,
      title,
      chunkIds: assigned.map((chunk) => chunk.id),
      characterCount: paragraphs.join("\n\n").length,
      preview: paragraphs.join("\n\n"),
      paragraphs,
      proposed: false,
    };
  });
  const frontSections = [
    { slug: "front-matter", title: "题名与作者信息", chunks: mapping.frontMatter },
    { slug: "abstract", title: "摘要", chunks: mapping.abstract },
    { slug: "keywords", title: "关键词", chunks: mapping.keywords },
  ].filter((section) => section.chunks.length && !sections.some((existing) => existing.slug === section.slug)).map((section) => {
    const paragraphs = section.chunks.map((chunk) => chunk.text.trim()).filter(Boolean);
    return {
      sectionId: `proposed:${section.slug}`,
      slug: section.slug,
      title: section.title,
      chunkIds: section.chunks.map((chunk) => chunk.id),
      characterCount: paragraphs.join("\n\n").length,
      preview: paragraphs.join("\n\n"),
      paragraphs,
      proposed: true,
    };
  });
  if (mapping.references.length && !hasStandaloneReferences) {
    const paragraphs = mapping.references.map((chunk) => chunk.text.trim()).filter(Boolean);
    mappedSections.push({
      sectionId: "proposed:references",
      slug: "references",
      title: "参考文献",
      chunkIds: mapping.references.map((chunk) => chunk.id),
      characterCount: paragraphs.join("\n\n").length,
      preview: paragraphs.join("\n\n"),
      paragraphs,
      proposed: true,
    });
  }

  const candidateSections = [...frontSections, ...mappedSections];
  const assignedSectionByChunk = new Map(candidateSections.flatMap((section) =>
    section.chunkIds.map((chunkId) => [chunkId, section.sectionId] as const)));
  const unassignedChunkIds = chunks
    .filter((chunk) => !assignedSectionByChunk.has(chunk.id))
    .map((chunk) => chunk.id);
  return {
    materialId: material.id,
    filename: material.filename,
    parseRunId: parseRun.id,
    chunkCount: chunks.length,
    structuredStats: parsedDocument ? JSON.parse(parsedDocument.stats_json) as Record<string, number> : null,
    warnings: parsedDocument ? JSON.parse(parsedDocument.warnings_json) as string[] : ["LEGACY_PLAINTEXT_PARSE"],
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      assignedSectionId: assignedSectionByChunk.get(chunk.id) ?? "",
    })),
    sections: candidateSections,
    unassignedChunkIds,
  };
}

export async function confirmManuscriptImport(
  actor: M3Actor,
  projectId: string,
  input: { materialId: string; parseRunId: string; sections: Array<{ sectionId: string; chunkIds: string[] }> },
): Promise<{ importedSectionIds: string[]; skippedSectionIds: string[] }> {
  const db = getD1();
  await requireProject(db, actor.userId, projectId);
  const candidate = await buildManuscriptImportCandidate(actor, projectId, input.materialId);
  if (candidate.parseRunId !== input.parseRunId) {
    throw new ManuscriptImportError("PARSE_RUN_CHANGED", "初稿解析版本已经变化，请重新预览后再确认。");
  }
  const allowedSectionIds = new Set(candidate.sections.map((section) => section.sectionId));
  const candidateChunkIds = new Set(candidate.chunks.map((chunk) => chunk.id));
  const requiredChunkIds = new Set(candidate.chunks
    .filter((chunk) => chunk.assignedSectionId)
    .map((chunk) => chunk.id));
  const submittedChunkIds = input.sections.flatMap((section) => section.chunkIds);
  const submittedChunkIdSet = new Set(submittedChunkIds);
  if (
    input.sections.length !== candidate.sections.length
    || input.sections.some((section) => !allowedSectionIds.has(section.sectionId))
    || submittedChunkIdSet.size !== submittedChunkIds.length
    || submittedChunkIds.some((chunkId) => !candidateChunkIds.has(chunkId))
    || [...requiredChunkIds].some((chunkId) => !submittedChunkIdSet.has(chunkId))
  ) {
    throw new ManuscriptImportError("CANDIDATE_CHANGED", "章节分配包含遗漏、重复或已失效片段，请重新预览后再确认。");
  }

  const chunkRows = await db.prepare(
    `SELECT id, text, block_id FROM material_chunks WHERE owner_user_id = ? AND project_id = ?
       AND material_id = ? AND parse_run_id = ? ORDER BY ordinal`,
  ).bind(actor.userId, projectId, candidate.materialId, candidate.parseRunId)
    .all<{ id: string; text: string; block_id: string | null }>();
  const textById = new Map((chunkRows.results ?? []).map((chunk) => [chunk.id, chunk.text]));
  const blockIdByChunkId = new Map((chunkRows.results ?? []).map((chunk) => [chunk.id, chunk.block_id]));
  const parsedDocumentRow = await db.prepare(
    `SELECT content_json FROM parsed_documents WHERE owner_user_id = ? AND project_id = ?
     AND material_id = ? AND parse_run_id = ? LIMIT 1`,
  ).bind(actor.userId, projectId, candidate.materialId, candidate.parseRunId).first<{ content_json: string }>();
  const parsedDocument = parsedDocumentRow ? JSON.parse(parsedDocumentRow.content_json) as DocumentContent : null;
  const importedSectionIds: string[] = [];
  const skippedSectionIds: string[] = [];
  const statements: D1PreparedStatement[] = [];
  const selectedSectionIds = new Set(input.sections.filter((section) => section.chunkIds.length).map((section) => section.sectionId));
  const newFrontSectionCount = candidate.sections.filter((section) =>
    section.proposed && section.slug !== "references" && selectedSectionIds.has(section.sectionId)).length;
  if (newFrontSectionCount) statements.push(db.prepare(
    `UPDATE sections SET position = position + 1000, updated_at = CURRENT_TIMESTAMP
     WHERE owner_user_id = ? AND project_id = ? AND outline_id = (
       SELECT id FROM outlines WHERE owner_user_id = ? AND project_id = ?
       ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, version_number DESC LIMIT 1
     )`,
  ).bind(actor.userId, projectId, actor.userId, projectId), db.prepare(
    `UPDATE sections SET position = position - 1000 + ?, updated_at = CURRENT_TIMESTAMP
     WHERE owner_user_id = ? AND project_id = ? AND position >= 1000 AND outline_id = (
       SELECT id FROM outlines WHERE owner_user_id = ? AND project_id = ?
       ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, version_number DESC LIMIT 1
     )`,
  ).bind(newFrontSectionCount, actor.userId, projectId, actor.userId, projectId));
  for (const section of input.sections) {
    if (!section.chunkIds.length) continue;
    let targetSectionId = section.sectionId;
    if (section.sectionId.startsWith("proposed:")) {
      targetSectionId = crypto.randomUUID();
      const proposed = candidate.sections.find((item) => item.sectionId === section.sectionId)!;
      const nextPosition = candidate.sections.findIndex((item) => item.sectionId === section.sectionId) + 1;
      statements.push(db.prepare(
        `INSERT INTO sections (id, owner_user_id, project_id, outline_id, slug, title, position, status, word_count)
         SELECT ?, ?, ?, id, ?, ?, ?, 'not_started', 0 FROM outlines
         WHERE owner_user_id = ? AND project_id = ?
         ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, version_number DESC LIMIT 1`,
      ).bind(targetSectionId, actor.userId, projectId, proposed.slug, proposed.title, nextPosition, actor.userId, projectId));
    }
    const existing = section.sectionId.startsWith("proposed:") ? null : await db.prepare(
      `SELECT id, version_number, content, summary FROM section_versions WHERE owner_user_id = ? AND project_id = ? AND section_id = ? ORDER BY version_number DESC LIMIT 1`,
    ).bind(actor.userId, projectId, targetSectionId).first<{ id: string; version_number: number; content: string; summary: string | null }>();
    const selectedBlockIds = new Set(section.chunkIds.map((id) => blockIdByChunkId.get(id)).filter((id): id is string => Boolean(id)));
    const sectionDocument = parsedDocument && selectedBlockIds.size
      ? { version: 1 as const, blocks: parsedDocument.blocks.filter((block) => selectedBlockIds.has(block.id)) }
      : null;
    const content = sectionDocument ? documentToPlainText(sectionDocument) : section.chunkIds.map((id) => textById.get(id)?.trim() ?? "").filter(Boolean).join("\n\n");
    if (!content) continue;
    const repairsMixedFrontMatter = existing && candidate.sections.find((item) => item.sectionId === section.sectionId)?.slug === "section-1"
      && /[【[]摘要[】\]]/u.test(existing.content) && /[【[]关键词[】\]]/u.test(existing.content);
    if (existing?.content === content || (existing && !existing.summary?.includes(`material=${candidate.materialId}`) && !repairsMixedFrontMatter)) {
      skippedSectionIds.push(targetSectionId);
      continue;
    }
    statements.push(
      db.prepare(
        `INSERT INTO section_versions (id, owner_user_id, project_id, section_id, version_number,
          source, content, content_json, content_hash, summary) VALUES (?, ?, ?, ?, ?, 'original', ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), actor.userId, projectId, targetSectionId, (existing?.version_number ?? 0) + 1, content,
        sectionDocument ? JSON.stringify(sectionDocument) : null,
        await hashText(content), `从初稿 ${candidate.filename} 导入；material=${candidate.materialId}; parseRun=${candidate.parseRunId}`),
      db.prepare(
        `UPDATE sections SET status = 'editing', word_count = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      ).bind(countWords(content), targetSectionId, actor.userId, projectId),
    );
    importedSectionIds.push(targetSectionId);
  }
  const renamedPlan = candidate.sections.find((section) => section.title === "后续研究计划" && !section.proposed);
  if (renamedPlan) statements.push(db.prepare(
    `UPDATE sections SET title = '后续研究计划', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_user_id = ? AND project_id = ? AND title = '后续研究计划与参考文献'`,
  ).bind(renamedPlan.sectionId, actor.userId, projectId));
  if (statements.length) await db.batch(statements);
  return { importedSectionIds, skippedSectionIds };
}

async function requireProject(db: D1Database, userId: string, projectId: string): Promise<void> {
  const project = await db.prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
  ).bind(projectId, userId).first<{ id: string }>();
  if (!project) throw new ManuscriptImportError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
}

async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countWords(value: string): number {
  const latin = value.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu)?.length ?? 0;
  const han = value.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  return latin + han;
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/gu, "");
}
