"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { M6HeadingPrefixStyle } from "../../../lib/m6-docx";
import { AppShell } from "../../../components/AppShell";
import styles from "./export.module.css";

type SectionVersion = {
  id: string;
  versionNumber: number;
  source: string;
  summary: string;
  wordCount: number;
  preview: string;
  createdAt: string;
  isLatest: boolean;
};

type ExportSection = {
  id: string;
  slug: string;
  title: string;
  position: number;
  status: string;
  versionId: string | null;
  versionNumber: number | null;
  wordCount: number;
  versions: SectionVersion[];
};

type ExportWorkspace = {
  project: { id: string; title: string };
  sections: ExportSection[];
  exports: Array<{
    id: string;
    status: string;
    sourceVersionIds: string[];
    errorMessage: string | null;
    createdAt: string;
  }>;
};

type CreatedExport = {
  id: string;
  status: "ready";
  sourceVersionIds: string[];
  readiness: { warnings: Array<{ code: string; message: string }> };
};

const headingOptions: Array<{
  value: M6HeadingPrefixStyle;
  label: string;
  example: string;
}> = [
  { value: "none", label: "无前缀", example: "引言" },
  { value: "chinese_dunhao", label: "中文序号", example: "一、引言" },
  { value: "arabic_dunhao", label: "阿拉伯数字 + 顿号", example: "1、引言" },
  { value: "arabic_dot", label: "阿拉伯数字 + 句点", example: "1. 引言" },
];

export default function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [workspace, setWorkspace] = useState<ExportWorkspace | null>(null);
  const [choiceBySection, setChoiceBySection] = useState<Record<string, string>>({});
  const [includedSections, setIncludedSections] = useState<string[]>([]);
  const [headingPrefixStyle, setHeadingPrefixStyle] = useState<M6HeadingPrefixStyle>("none");
  const [preview, setPreview] = useState<{ section: ExportSection; version: SectionVersion } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ section: ExportSection; version: SectionVersion } | null>(null);
  const [created, setCreated] = useState<CreatedExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在读取当前提纲的章节版本……");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWorkspace(projectId)
      .then((data) => {
        if (cancelled) return;
        applyWorkspace(data);
        setMessage(data.sections.some((section) => section.versionId)
          ? "每章只导出一个明确版本；可切换、预览并管理未被引用的旧版本。"
          : "当前提纲还没有可导出的章节版本。");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        setMessage(error instanceof Error ? error.message : "导出信息读取失败。");
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const versionedSections = useMemo(
    () => workspace?.sections.filter((section) => section.versions.length) ?? [],
    [workspace],
  );
  const selectedVersionIds = useMemo(
    () => workspace?.sections.flatMap((section) => {
      const versionId = choiceBySection[section.id];
      return includedSections.includes(section.id) && versionId ? [versionId] : [];
    }) ?? [],
    [choiceBySection, includedSections, workspace],
  );
  const checks = [
    { title: "项目与权限", detail: workspace ? `已读取当前账号下的项目“${workspace.project.title}”。` : message, state: workspace ? "pass" : "block" },
    { title: "当前提纲章节", detail: workspace ? `${versionedSections.length}/${workspace.sections.length} 个当前提纲章节已有正式版本；旧提纲不会混入。` : "等待项目数据。", state: versionedSections.length ? "pass" : "block" },
    { title: "本次导出范围", detail: selectedVersionIds.length ? `已选择 ${selectedVersionIds.length} 个章节，每章恰好一个版本。` : "至少选择一个章节版本。", state: selectedVersionIds.length ? "pass" : "block" },
    { title: "引用与证据核验", detail: "生成前由服务端执行权威预检；已被任务、证据或历史导出引用的版本会继续保留。", state: "warning" },
  ] as const;
  const blockers = checks.filter((check) => check.state === "block").length;

  function applyWorkspace(data: ExportWorkspace) {
    setWorkspace(data);
    setChoiceBySection(Object.fromEntries(data.sections.flatMap((section) => section.versionId ? [[section.id, section.versionId]] : [])));
    setIncludedSections(data.sections.filter((section) => section.versionId).map((section) => section.id));
  }

  function toggleSection(sectionId: string) {
    setCreated(null);
    setIncludedSections((current) => current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]);
  }

  function chooseVersion(sectionId: string, versionId: string) {
    setCreated(null);
    setChoiceBySection((current) => ({ ...current, [sectionId]: versionId }));
    setIncludedSections((current) => current.includes(sectionId) ? current : [...current, sectionId]);
  }

  async function deleteVersion() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/m6/projects/${encodeURIComponent(projectId)}/exports`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version_id: deleteTarget.version.id }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "历史版本删除失败。");
      const data = await loadWorkspace(projectId);
      applyWorkspace(data);
      setPreview((current) => current?.version.id === deleteTarget.version.id ? null : current);
      setDeleteTarget(null);
      setMessage(`已删除“${deleteTarget.section.title}”的 v${deleteTarget.version.versionNumber}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史版本删除失败。");
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function createExport() {
    if (!selectedVersionIds.length) return;
    setBusy(true);
    setCreated(null);
    setMessage("正在核验章节、引用和证据并生成 DOCX……");
    try {
      const response = await fetch(`/api/m6/projects/${encodeURIComponent(projectId)}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "docx", version_ids: selectedVersionIds, heading_prefix_style: headingPrefixStyle }),
      });
      const payload = (await response.json()) as { data?: CreatedExport; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "DOCX 生成失败。");
      setCreated(payload.data);
      setMessage(payload.data.readiness.warnings.length
        ? `DOCX 已生成，并保留 ${payload.data.readiness.warnings.length} 条普通证据警告。`
        : "DOCX 已生成并通过服务端预检。");
      setWorkspace(await loadWorkspace(projectId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DOCX 生成失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      action={<Link className={styles.backLink} href={`/projects/${projectId}/editor`}>← 返回编辑器</Link>}
      compact
      description="按当前提纲逐章选择正式版本，并明确 DOCX 章节标题的编号方式。"
      eyebrow="DOCX PREFLIGHT"
      title="Word 导出检查"
    >
      <section className={styles.summary}>
        <div><strong>当前仅提供 DOCX</strong><h2>{blockers === 0 ? "可以执行服务端预检" : `还有 ${blockers} 个阻断项`}</h2><p>{message}</p></div>
        <div className={blockers === 0 ? styles.scorePass : styles.scoreBlock}><strong>{checks.length - blockers}/{checks.length}</strong><span>页面检查</span></div>
      </section>

      <section className={styles.checkList} aria-label="DOCX 导出前检查">
        {checks.map((check, index) => (
          <article className={styles.checkRow} key={check.title}>
            <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
            <span className={`${styles.stateMark} ${styles[check.state]}`}>{check.state === "pass" ? "通过" : check.state === "warning" ? "待服务端核验" : "阻断"}</span>
            <div><h3>{check.title}</h3><p>{check.detail}</p></div>
            <div className={styles.rowAction}>{loadFailed ? <button onClick={() => location.reload()} type="button">重新读取</button> : null}</div>
          </article>
        ))}
      </section>

      {workspace ? (
        <section className={styles.sectionSelector} aria-labelledby="export-sections-title">
          <header>
            <div><span>EXPORT SCOPE</span><h2 id="export-sections-title">逐章选择版本</h2><p>这里不再平铺两套章节。每一行对应当前提纲的一章，勾选决定是否导出，下拉框决定导出哪个版本。</p></div>
            <strong>{selectedVersionIds.length} / {versionedSections.length} 章</strong>
          </header>
          <div className={styles.sectionRows}>
            {workspace.sections.map((section, index) => {
              const chosenId = choiceBySection[section.id] ?? "";
              const chosen = section.versions.find((version) => version.id === chosenId);
              const included = includedSections.includes(section.id);
              return (
                <article className={`${styles.sectionRow} ${!section.versions.length ? styles.emptySection : ""}`} key={section.id}>
                  <label className={styles.sectionIdentity}>
                    <input checked={included} disabled={!section.versions.length} onChange={() => toggleSection(section.id)} type="checkbox" />
                    <span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{section.title}</strong><small>{section.versions.length ? `${section.versions.length} 个正式版本` : "尚无正式章节版本，不会导出"}</small></span>
                  </label>
                  {section.versions.length ? (
                    <div className={styles.versionPicker}>
                      <label><span>本次导出版本</span><select aria-label={`${section.title}导出版本`} value={chosenId} onChange={(event) => chooseVersion(section.id, event.target.value)}>{section.versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} · {version.wordCount} 字 · {formatDate(version.createdAt)}</option>)}</select></label>
                      <button disabled={!chosen} onClick={() => chosen && setPreview({ section, version: chosen })} type="button">简略阅览</button>
                      <details className={styles.versionHistory}>
                        <summary>过去版本 · {Math.max(0, section.versions.length - 1)}</summary>
                        <div>
                          {section.versions.map((version) => (
                            <article key={version.id}>
                              <div><strong>v{version.versionNumber}{version.isLatest ? " · 当前版" : ""}</strong><small>{formatDate(version.createdAt)} · {version.wordCount} 字 · {version.source}</small></div>
                              <button onClick={() => setPreview({ section, version })} type="button">阅览</button>
                              {version.isLatest ? <span className={styles.keepLabel}>必须保留</span> : <button className={styles.deleteButton} onClick={() => setDeleteTarget({ section, version })} type="button">删除</button>}
                            </article>
                          ))}
                        </div>
                      </details>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <fieldset className={styles.headingStyle}>
        <legend>DOCX 正文章节标题开头</legend>
        <p>只为正文各章连续编号；题名与作者信息、摘要、关键词、参考文献保持无编号。</p>
        <div>{headingOptions.map((option) => <label className={headingPrefixStyle === option.value ? styles.headingOptionActive : styles.headingOption} key={option.value}><input checked={headingPrefixStyle === option.value} name="heading-prefix" onChange={() => setHeadingPrefixStyle(option.value)} type="radio" /><span><strong>{option.label}</strong><small>{option.example}</small></span></label>)}</div>
      </fieldset>

      <footer className={styles.exportBar}>
        <div><strong>输出格式：DOCX</strong><span>导出记录绑定所选版本 ID 与本次标题编号规则，不会静默替换版本。</span></div>
        <button disabled={busy || blockers > 0} onClick={createExport} type="button">{busy ? "正在处理……" : "生成 DOCX →"}</button>
      </footer>

      {created ? <div className={styles.successNotice} role="status"><strong>DOCX 已生成</strong><a download href={`/api/m6/projects/${projectId}/exports/${created.id}`}>下载 DOCX</a></div> : null}

      {workspace?.exports.length ? <details className={styles.exportHistory}><summary>历史导出记录 · {workspace.exports.length}</summary>{workspace.exports.map((item) => <div key={item.id}><span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span><strong>{item.status}</strong>{item.status === "ready" ? <a download href={`/api/m6/projects/${projectId}/exports/${item.id}`}>下载</a> : <small>{item.errorMessage || "未生成文件"}</small>}</div>)}</details> : null}

      {preview ? <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPreview(null)}><section aria-labelledby="version-preview-title" aria-modal="true" className={styles.previewDialog} role="dialog"><header><div><span>VERSION PREVIEW</span><h2 id="version-preview-title">{preview.section.title} · v{preview.version.versionNumber}</h2><p>{formatDate(preview.version.createdAt)} · {preview.version.wordCount} 字 · {preview.version.source}</p></div><button aria-label="关闭版本预览" onClick={() => setPreview(null)} type="button">×</button></header>{preview.version.summary ? <aside><strong>版本摘要</strong><p>{preview.version.summary}</p></aside> : null}<div className={styles.previewText}>{preview.version.preview || "该版本暂无可预览正文。"}</div><footer><button onClick={() => setPreview(null)} type="button">关闭阅览</button></footer></section></div> : null}

      {deleteTarget ? <div className={styles.modalOverlay} role="presentation"><section aria-labelledby="version-delete-title" aria-modal="true" className={styles.deleteDialog} role="alertdialog"><span>DELETE OLD VERSION</span><h2 id="version-delete-title">删除“{deleteTarget.section.title}”v{deleteTarget.version.versionNumber}？</h2><p>仅未被导出、任务、证据、审阅或恢复链引用的旧版本可以删除。此操作不可撤销，当前最新版不会受影响。</p><div><button disabled={busy} onClick={() => setDeleteTarget(null)} type="button">取消</button><button className={styles.confirmDelete} disabled={busy} onClick={deleteVersion} type="button">{busy ? "正在核验……" : "确认删除旧版本"}</button></div></section></div> : null}
    </AppShell>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadWorkspace(projectId: string): Promise<ExportWorkspace> {
  const response = await fetch(`/api/m6/projects/${encodeURIComponent(projectId)}/exports`, { cache: "no-store" });
  const payload = (await response.json()) as { data?: ExportWorkspace; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || "导出信息读取失败。");
  return payload.data;
}
