"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell, MockBadge } from "../../../components/AppShell";
import { useMockWorkspace } from "../../../lib/MockWorkspaceContext";
import styles from "./export.module.css";

export default function ExportPage() {
  const {
    diagnosisStatus,
    outline,
    outlineConfirmed,
    unsavedChanges,
    setUnsavedChanges,
  } = useMockWorkspace();
  const [citationResolved, setCitationResolved] = useState(false);
  const [exported, setExported] = useState(false);

  const checks = [
    {
      id: "saved",
      title: "未保存修改",
      detail: unsavedChanges ? "当前章节还有未保存修改。" : "所有修改均已保存。",
      state: unsavedChanges ? "block" : "pass",
    },
    {
      id: "diagnosis",
      title: "项目诊断卡",
      detail:
        diagnosisStatus === "confirmed"
          ? "诊断卡已确认。"
          : diagnosisStatus === "updated"
            ? "诊断卡修改后尚未重新确认。"
            : "诊断卡仍为草稿。",
      state: diagnosisStatus === "confirmed" ? "pass" : "block",
    },
    {
      id: "outline",
      title: "论文目录",
      detail: outlineConfirmed ? "目录已确认。" : "目录顺序或标题尚未确认。",
      state: outlineConfirmed ? "pass" : "block",
    },
    {
      id: "chapters",
      title: "缺失或未确认章节",
      detail: `${outline.filter((section) => section.status === "未开始" || section.status === "缺少材料").length} 个章节尚未完成；可只导出已确认内容。`,
      state: "warning",
    },
    {
      id: "evidence",
      title: "无法验证的引用",
      detail: "2 条论断只能标记为“无法确认”，外部数据库未验证。",
      state: "warning",
    },
    {
      id: "citation",
      title: "正文引用与参考文献对应",
      detail: citationResolved ? "引用对应问题已标记处理 · Mock。" : "发现 1 处正文引用没有对应参考文献。",
      state: citationResolved ? "pass" : "block",
    },
  ] as const;

  const blockers = checks.filter((check) => check.state === "block").length;

  return (
    <AppShell
      action={<Link className={styles.backLink} href="/projects/demo/editor">← 返回编辑器</Link>}
      compact
      description="导出前先确认保存、项目上下文、章节与引用状态。本阶段不会生成或下载真实文件。"
      eyebrow="DOCX preflight · Mock"
      title="Word 导出检查"
    >
      <section className={styles.summary}>
        <div>
          <MockBadge>只提供 DOCX</MockBadge>
          <h2>{blockers === 0 ? "可以生成演示导出任务" : `还有 ${blockers} 个阻断项`}</h2>
          <p>警告项可以随已确认内容一起导出，但会写入检查说明；阻断项必须先处理。</p>
        </div>
        <div className={blockers === 0 ? styles.scorePass : styles.scoreBlock}>
          <strong>{checks.length - blockers}/{checks.length}</strong>
          <span>通过检查</span>
        </div>
      </section>

      <section className={styles.checkList} aria-label="DOCX 导出前检查">
        {checks.map((check, index) => (
          <article className={styles.checkRow} key={check.id}>
            <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
            <span className={`${styles.stateMark} ${styles[check.state]}`}>
              {check.state === "pass" ? "通过" : check.state === "warning" ? "警告" : "阻断"}
            </span>
            <div>
              <h3>{check.title}</h3>
              <p>{check.detail}</p>
            </div>
            <div className={styles.rowAction}>
              {check.id === "saved" && unsavedChanges ? (
                <button onClick={() => setUnsavedChanges(false)} type="button">保存修改</button>
              ) : null}
              {check.id === "diagnosis" && diagnosisStatus !== "confirmed" ? (
                <Link href="/projects/demo/diagnosis">返回诊断卡</Link>
              ) : null}
              {check.id === "outline" && !outlineConfirmed ? (
                <Link href="/projects/demo/outline">确认目录</Link>
              ) : null}
              {check.id === "citation" && !citationResolved ? (
                <button onClick={() => setCitationResolved(true)} type="button">标记已处理 · Mock</button>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <footer className={styles.exportBar}>
        <div>
          <strong>输出格式：DOCX</strong>
          <span>包含标题、已确认目录、所选章节、正文引用和参考文献。</span>
        </div>
        <button
          disabled={blockers > 0}
          onClick={() => setExported(true)}
          type="button"
        >
          生成 DOCX（演示） →
        </button>
      </footer>

      {exported ? (
        <div className={styles.successNotice} role="status">
          <strong>演示导出任务已完成</strong>
          <span>本阶段不会生成真实文件；M6 才会接入可下载的 DOCX 产物。</span>
        </div>
      ) : null}
    </AppShell>
  );
}
