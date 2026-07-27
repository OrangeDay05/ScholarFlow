"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import { useMockWorkspace } from "@/app/lib/MockWorkspaceContext";
import styles from "./outline.module.css";

const statusClass: Record<string, string> = {
  未开始: "statusIdle",
  编辑中: "statusEditing",
  待检查: "statusChecking",
  已确认: "statusConfirmed",
  缺少材料: "statusMissing",
};

export default function OutlinePage() {
  const router = useRouter();
  const {
    dataSource,
    diagnosisStatus,
    outline,
    outlineConfirmed,
    persistenceError,
    persistenceStatus,
    updateOutlineTitle,
    moveOutline,
    confirmOutline,
  } = useMockWorkspace();
  const [generated, setGenerated] = useState(outlineConfirmed);
  const [generating, setGenerating] = useState(false);

  function generateOutline() {
    setGenerating(true);
    window.setTimeout(() => {
      setGenerated(true);
      setGenerating(false);
    }, 650);
  }

  async function confirmAndContinue() {
    try {
      await confirmOutline();
      router.push("/projects/demo/editor");
    } catch {
      // The context exposes the persistence error in the status row.
    }
  }

  return (
    <AppShell
      compact
      eyebrow="项目诊断与提纲 · Mock"
      title="确认论文目录"
      description="目录由已确认的诊断卡生成。你可以修改标题和顺序，再把确认版本交给章节编辑器。"
      action={
        <Link className={styles.backLink} href="/projects/demo/diagnosis">
          ← 返回诊断卡
        </Link>
      }
    >
      <section className={styles.flowBar} aria-label="项目准备流程">
        <div className={styles.flowDone}>
          <span>01</span>
          <strong>论文要求</strong>
          <small>已整理</small>
        </div>
        <div className={styles.flowDone}>
          <span>02</span>
          <strong>诊断卡</strong>
          <small>{diagnosisStatus === "confirmed" ? "已确认" : "需重新确认"}</small>
        </div>
        <div className={generated ? styles.flowActive : styles.flowCurrent}>
          <span>03</span>
          <strong>论文目录</strong>
          <small>{outlineConfirmed ? "已确认" : generated ? "待确认" : "待生成"}</small>
        </div>
        <div>
          <span>04</span>
          <strong>章节写作</strong>
          <small>下一步</small>
        </div>
      </section>

      {!generated ? (
        <section className={styles.generatePanel} aria-live="polite">
          <MockBadge>项目诊断与提纲 · Mock</MockBadge>
          <span className={styles.generateMark} aria-hidden="true">
            纲
          </span>
          <h2>{generating ? "正在整理章节结构…" : "诊断卡已经可以生成目录"}</h2>
          <p>
            系统会根据题目、研究问题、文章要求和当前缺失材料生成一个可编辑目录，不会生成正文或虚构研究结果。
          </p>
          <button type="button" onClick={generateOutline} disabled={generating}>
            {generating ? "生成中 · Mock" : "生成论文目录（Mock）"}
          </button>
        </section>
      ) : (
        <>
          <div className={styles.metaRow}>
            <MockBadge>{dataSource === "d1" ? "M3 · D1 基础数据" : undefined}</MockBadge>
            <span>共 {outline.length} 个一级章节</span>
            <strong>{outline.reduce((sum, section) => sum + section.words, 0)} 字已有内容</strong>
            <span>{outlineConfirmed ? "确认版本" : "可编辑草稿"}</span>
            {persistenceStatus === "loading" ? <span>正在读取基础数据…</span> : null}
            {persistenceError ? <span role="alert">{persistenceError}</span> : null}
          </div>

          <section className={styles.outlineCard}>
            <header className={styles.cardHeader}>
              <div>
                <span>03</span>
                <div>
                  <h2>论文目录草稿</h2>
                  <p>修改标题或顺序后，已确认状态会自动失效。</p>
                </div>
              </div>
              <button className={styles.regenerateButton} type="button" onClick={generateOutline}>
                重新生成 · Mock
              </button>
            </header>

            <div className={styles.sectionList}>
              {outline.map((section, index) => (
                <article className={styles.sectionRow} key={section.id}>
                  <span className={styles.sectionIndex}>{section.index}</span>
                  <div className={styles.sectionMain}>
                    <label htmlFor={`outline-${section.id}`}>章节标题</label>
                    <input
                      id={`outline-${section.id}`}
                      value={section.title}
                      onChange={(event) => updateOutlineTitle(section.id, event.target.value)}
                    />
                  </div>
                  <div className={styles.sectionMeta}>
                    <span className={styles[statusClass[section.status] ?? "statusIdle"]}>
                      {section.status}
                    </span>
                    <small>{section.words ? `${section.words} 字` : "尚无正文"}</small>
                  </div>
                  <div className={styles.moveActions} aria-label={`${section.title} 排序`}>
                    <button
                      type="button"
                      aria-label={`${section.title} 上移`}
                      disabled={index === 0}
                      onClick={() => moveOutline(section.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${section.title} 下移`}
                      disabled={index === outline.length - 1}
                      onClick={() => moveOutline(section.id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.boundaryNote}>
            <div>
              <span>写作边界</span>
              <strong>结果与讨论仍标记为“缺少材料”</strong>
            </div>
            <p>确认目录只确认文章结构，不代表系统可以生成尚无证据支持的结果。</p>
          </section>

          <footer className={`${styles.confirmBar} ${outlineConfirmed ? styles.confirmedBar : ""}`}>
            <div>
              <strong>{outlineConfirmed ? "目录已经确认" : "确认后即可进入章节编辑器"}</strong>
              <span>
                {outlineConfirmed
                  ? "再次修改标题或排序会把目录恢复为待确认。"
                  : "后续写作会按这个顺序建立章节，原始诊断卡和目录版本不会被覆盖。"}
              </span>
            </div>
            <div className={styles.confirmActions}>
              <Link className={styles.secondaryAction} href="/projects/demo/diagnosis">
                修改诊断卡
              </Link>
              <button className={styles.primaryAction} type="button" onClick={confirmAndContinue}>
                确认目录并进入编辑器 →
              </button>
            </div>
          </footer>
        </>
      )}
    </AppShell>
  );
}
