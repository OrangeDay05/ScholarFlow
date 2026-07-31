"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import styles from "./export.module.css";

type ExportWorkspace = {
  project: { id: string; title: string };
  sections: Array<{
    id: string;
    slug: string;
    title: string;
    position: number;
    status: string;
    versionId: string | null;
    versionNumber: number | null;
    wordCount: number;
  }>;
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
  readiness: {
    warnings: Array<{ code: string; message: string }>;
  };
};

export default function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [workspace, setWorkspace] = useState<ExportWorkspace | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在读取可导出的章节版本……");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadWorkspace(projectId)
      .then((data) => {
        if (cancelled) return;
        setWorkspace(data);
        const versionIds = data.sections.flatMap((section) =>
          section.versionId ? [section.versionId] : [],
        );
        setSelected(versionIds);
        setMessage(
          versionIds.length
            ? "请选择要导出的不可变章节版本；生成时服务端会再次核验引用与证据。"
            : "当前项目还没有可导出的章节版本。",
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        setMessage(error instanceof Error ? error.message : "导出信息读取失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const versionedSections = useMemo(
    () => workspace?.sections.filter((section) => section.versionId) ?? [],
    [workspace],
  );
  const checks = [
    {
      title: "项目与权限",
      detail: workspace
        ? `已读取当前账号下的项目“${workspace.project.title}”。`
        : message,
      state: workspace ? "pass" : "block",
    },
    {
      title: "可用章节版本",
      detail: workspace
        ? `${versionedSections.length}/${workspace.sections.length} 个章节已有不可变版本；没有版本的章节不会进入 DOCX。`
        : "等待项目数据。",
      state: versionedSections.length ? "pass" : "block",
    },
    {
      title: "本次导出范围",
      detail: selected.length
        ? `已选择 ${selected.length} 个章节版本。`
        : "至少选择一个章节版本。",
      state: selected.length ? "pass" : "block",
    },
    {
      title: "引用与证据核验",
      detail: "生成前由服务端执行权威预检；元数据未核验或高风险证据不足时会阻止导出。",
      state: "warning",
    },
  ] as const;
  const blockers = checks.filter((check) => check.state === "block").length;

  function toggleVersion(versionId: string) {
    setCreated(null);
    setSelected((current) =>
      current.includes(versionId)
        ? current.filter((id) => id !== versionId)
        : [...current, versionId],
    );
  }

  async function createExport() {
    if (!selected.length) return;
    setBusy(true);
    setCreated(null);
    setMessage("正在核验章节、引用和证据并生成 DOCX……");
    try {
      const response = await fetch(`/api/m6/projects/${encodeURIComponent(projectId)}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "docx", version_ids: selected }),
      });
      const payload = (await response.json()) as {
        data?: CreatedExport;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message || "DOCX 生成失败。");
      }
      setCreated(payload.data);
      setMessage(
        payload.data.readiness.warnings.length
          ? `DOCX 已生成，并保留 ${payload.data.readiness.warnings.length} 条普通证据警告。`
          : "DOCX 已生成并通过服务端预检。",
      );
      setWorkspace(await loadWorkspace(projectId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DOCX 生成失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      action={
        <Link className={styles.backLink} href={`/projects/${projectId}/editor`}>
          ← 返回编辑器
        </Link>
      }
      compact
      description="选择真实章节版本后执行服务端预检；只有通过权限、引用和高风险证据检查的内容才能生成 DOCX。"
      eyebrow="DOCX PREFLIGHT"
      title="Word 导出检查"
    >
      <section className={styles.summary}>
        <div>
          <strong>当前仅提供 DOCX</strong>
          <h2>{blockers === 0 ? "可以执行服务端预检" : `还有 ${blockers} 个阻断项`}</h2>
          <p>{message}</p>
        </div>
        <div className={blockers === 0 ? styles.scorePass : styles.scoreBlock}>
          <strong>{checks.length - blockers}/{checks.length}</strong>
          <span>页面检查</span>
        </div>
      </section>

      <section className={styles.checkList} aria-label="DOCX 导出前检查">
        {checks.map((check, index) => (
          <article className={styles.checkRow} key={check.title}>
            <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
            <span className={`${styles.stateMark} ${styles[check.state]}`}>
              {check.state === "pass" ? "通过" : check.state === "warning" ? "待服务端核验" : "阻断"}
            </span>
            <div>
              <h3>{check.title}</h3>
              <p>{check.detail}</p>
            </div>
            <div className={styles.rowAction}>
              {loadFailed ? <button onClick={() => location.reload()} type="button">重新读取</button> : null}
            </div>
          </article>
        ))}
      </section>

      {workspace ? (
        <section className={styles.sectionSelector} aria-labelledby="export-sections-title">
          <header>
            <div>
              <span>EXPORT SCOPE</span>
              <h2 id="export-sections-title">选择章节版本</h2>
            </div>
            <strong>{selected.length} 个已选择</strong>
          </header>
          <div>
            {workspace.sections.map((section) => (
              <label className={styles.sectionToggle} key={section.id}>
                <input
                  checked={Boolean(section.versionId && selected.includes(section.versionId))}
                  disabled={!section.versionId}
                  onChange={() => section.versionId && toggleVersion(section.versionId)}
                  type="checkbox"
                />
                <span>
                  <strong>{section.title}</strong>
                  <small>
                    {section.versionId
                      ? `版本 v${section.versionNumber} · ${section.wordCount} 字 · ${section.status}`
                      : "尚无章节版本"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <footer className={styles.exportBar}>
        <div>
          <strong>输出格式：DOCX</strong>
          <span>导出记录绑定所选版本 ID，不会读取未选择的草稿或静默替换版本。</span>
        </div>
        <button disabled={busy || blockers > 0} onClick={createExport} type="button">
          {busy ? "正在生成……" : "生成 DOCX →"}
        </button>
      </footer>

      {created ? (
        <div className={styles.successNotice} role="status">
          <strong>DOCX 已生成</strong>
          <a download href={`/api/m6/projects/${projectId}/exports/${created.id}`}>
            下载 DOCX
          </a>
        </div>
      ) : null}

      {workspace?.exports.length ? (
        <details className={styles.exportHistory}>
          <summary>历史导出记录 · {workspace.exports.length}</summary>
          {workspace.exports.map((item) => (
            <div key={item.id}>
              <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              <strong>{item.status}</strong>
              {item.status === "ready" ? (
                <a download href={`/api/m6/projects/${projectId}/exports/${item.id}`}>下载</a>
              ) : (
                <small>{item.errorMessage || "未生成文件"}</small>
              )}
            </div>
          ))}
        </details>
      ) : null}
    </AppShell>
  );
}

async function loadWorkspace(projectId: string): Promise<ExportWorkspace> {
  const response = await fetch(`/api/m6/projects/${encodeURIComponent(projectId)}/exports`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: ExportWorkspace;
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message || "导出信息读取失败。");
  }
  return payload.data;
}
