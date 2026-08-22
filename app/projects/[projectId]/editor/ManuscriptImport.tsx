"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Editor.module.css";

type Candidate = {
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

export function ManuscriptImport({ projectId, autoOpen = false }: { projectId: string; autoOpen?: boolean }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [mounted, setMounted] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const autoOpened = useRef(false);

  useEffect(() => {
    setMounted(true);
    const key = importResultKey(projectId);
    const storedResult = window.sessionStorage.getItem(key);
    if (storedResult) {
      setResult(storedResult);
      window.sessionStorage.removeItem(key);
    }
  }, [projectId]);

  useEffect(() => {
    if (!autoOpen || autoOpened.current) return;
    autoOpened.current = true;
    void preview(true);
  // The project and initial empty-version state are stable for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, projectId]);

  async function preview(silent = false) {
    setBusy(true); setError(""); setResult("");
    try {
      const response = await fetch(`/api/m3/projects/${projectId}/manuscript-import`, { cache: "no-store" });
      const payload = await response.json() as { ok: boolean; data?: Candidate; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message || "无法生成章节导入候选。");
      setCandidate(payload.data);
      setAssignments(Object.fromEntries(payload.data.chunks.map((chunk) => [chunk.id, chunk.assignedSectionId])));
      setOpen(true);
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "无法生成章节导入候选。");
    }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!candidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/m3/projects/${projectId}/manuscript-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: candidate.materialId,
          parseRunId: candidate.parseRunId,
          sections: candidate.sections.map((section) => ({
            sectionId: section.sectionId,
            chunkIds: candidate.chunks.filter((chunk) => assignments[chunk.id] === section.sectionId).map((chunk) => chunk.id),
          })),
        }),
      });
      const payload = await response.json() as { ok: boolean; data?: { importedSectionIds: string[]; skippedSectionIds: string[] }; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message || "初稿导入失败。");
      const imported = payload.data.importedSectionIds.length;
      const skipped = payload.data.skippedSectionIds.length;
      const message = imported > 0
        ? `已从初稿导入 ${imported} 个章节${skipped > 0 ? `；另有 ${skipped} 个已有正文的章节未覆盖` : ""}。`
        : `未重复导入：${skipped} 个章节已经有正文，系统按保护规则保留了现有版本。`;
      setOpen(false);
      setCandidate(null);
      setResult(message);
      setBusy(false);
      if (imported > 0) {
        window.sessionStorage.setItem(importResultKey(projectId), message);
        window.location.reload();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "初稿导入失败。"); setBusy(false); }
  }

  function discussWithAi() {
    if (!candidate) return;
    const summary = candidate.sections.map((section) => {
      const count = candidate.chunks.filter((chunk) => assignments[chunk.id] === section.sectionId).length;
      return `${section.title}：${count} 个片段`;
    }).join("；");
    window.dispatchEvent(new CustomEvent("scholarflow:ai-draft", { detail: {
      prompt: `请作为初稿章节识别助手，检查《${candidate.filename}》当前章节分配是否合理：${summary}。请结合当前项目中已授权的这份初稿，逐条指出应该移动的片段及目标章节，并说明依据。只给出候选建议，不要声称已经修改正式正文。`,
      materialId: candidate.materialId,
    } }));
    setOpen(false);
  }

  async function reparseStructured() {
    if (!candidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/m5/projects/${projectId}/materials/${candidate.materialId}/parse`, {
        method: "POST", headers: { "Idempotency-Key": `structured-docx-${crypto.randomUUID()}` },
      });
      const payload = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "结构化解析失败。");
      await preview();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "结构化解析失败。"); }
    finally { setBusy(false); }
  }

  return <>
    <button className={styles.manuscriptImportButton} disabled={busy} onClick={() => void preview()} type="button">
      {busy && !open ? "正在整理初稿…" : "导入初稿正文"}
    </button>
    {result ? <span aria-live="polite" className={styles.manuscriptImportSuccess} role="status">{result}</span> : null}
    {error && !open ? <span className={styles.manuscriptImportError}>{error}</span> : null}
    {mounted && open && candidate ? createPortal(<div className={styles.manuscriptImportOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section aria-labelledby="manuscript-import-title" aria-modal="true" className={styles.manuscriptImportDialog} role="dialog">
        <header>
          <div><span>MANUSCRIPT IMPORT CANDIDATE</span><h2 id="manuscript-import-title">章节导入候选</h2></div>
          <button aria-label="关闭章节导入候选" disabled={busy} onClick={() => setOpen(false)} type="button">×</button>
        </header>
        <p className={styles.manuscriptImportNotice}>原始文件不会被覆盖。确认后仅为空章节创建正文 v1；已有正文的章节会跳过。</p>
        <dl className={styles.manuscriptImportMeta}>
          <div><dt>初稿</dt><dd>{candidate.filename}</dd></div>
          <div><dt>解析片段</dt><dd>{candidate.chunkCount} 个</dd></div>
          <div><dt>未分配</dt><dd>{candidate.unassignedChunkIds.length} 个</dd></div>
        </dl>
        {candidate.structuredStats ? <dl className={styles.manuscriptImportMeta}>
          <div><dt>标题</dt><dd>{candidate.structuredStats.headings ?? 0}</dd></div>
          <div><dt>段落 / 列表</dt><dd>{candidate.structuredStats.paragraphs ?? 0} / {candidate.structuredStats.lists ?? 0}</dd></div>
          <div><dt>表格 / 图片</dt><dd>{candidate.structuredStats.tables ?? 0} / {candidate.structuredStats.images ?? 0}</dd></div>
        </dl> : null}
        {candidate.warnings.length ? <p className={styles.manuscriptImportNotice}>格式提示：{candidate.warnings.join("、")}</p> : null}
        <div className={styles.manuscriptRecognitionActions}>
          <button disabled={busy} onClick={() => void preview()} type="button">重新生成识别候选</button>
          <button disabled={busy} onClick={() => void reparseStructured()} type="button">{busy ? "正在重新解析…" : "按原稿格式重新解析"}</button>
          <button disabled={busy} onClick={discussWithAi} type="button">与 AI 讨论识别</button>
        </div>
        <p className={styles.manuscriptImportNotice}>自动识别和 AI 建议都只是候选。你可以在每个片段上方直接更改目标章节，确认后才会创建正文版本。</p>
        <div className={styles.manuscriptImportSections}>
          {candidate.sections.map((section, index) => { const assignedChunks = candidate.chunks.filter((chunk) => assignments[chunk.id] === section.sectionId); return <article key={section.sectionId}>
            <div><span>{String(index + 1).padStart(2, "0")}</span><h3>{section.title}</h3>{section.proposed ? <em>确认后新增章节</em> : null}<small>{assignedChunks.length} 个片段 · {assignedChunks.reduce((sum, chunk) => sum + chunk.text.length, 0)} 字符</small></div>
            <div className={styles.manuscriptImportParagraphs}>
              {assignedChunks.length ? assignedChunks.map((chunk) => <div className={styles.manuscriptImportChunk} key={chunk.id}><label><span>片段 {chunk.ordinal + 1} · 目标章节</span><select onChange={(event) => setAssignments((current) => ({ ...current, [chunk.id]: event.target.value }))} value={assignments[chunk.id]}>{candidate.sections.map((target) => <option key={target.sectionId} value={target.sectionId}>{target.title}</option>)}</select></label><p>{chunk.text}</p></div>) : <p>没有识别到可导入内容。</p>}
            </div>
          </article>})}
        </div>
        {error ? <p className={styles.manuscriptImportError}>{error}</p> : null}
        <footer>
          <button disabled={busy} onClick={() => void confirm()} type="button">{busy ? "正在创建正文 v1…" : "确认导入并创建正文 v1"}</button>
          <button disabled={busy} onClick={() => setOpen(false)} type="button">关闭，不导入</button>
        </footer>
      </section>
    </div>, document.body) : null}
  </>;
}

function importResultKey(projectId: string) {
  return `scholarflow:manuscript-import-result:${projectId}`;
}
