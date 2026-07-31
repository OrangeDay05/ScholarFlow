"use client";

import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import styles from "./forms.module.css";

type FormScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  noteTitle: string;
  note: string;
  step: 1 | 2 | 3;
  realUpload?: boolean;
  children: React.ReactNode;
};

const steps = [
  { index: "01", label: "填写与上传" },
  { index: "02", label: "核对处理队列" },
  { index: "03", label: "确认创建" },
] as const;

export function FormScaffold({
  eyebrow,
  title,
  description,
  noteTitle,
  note,
  step,
  realUpload = false,
  children,
}: FormScaffoldProps) {
  return (
    <AppShell
      compact
      eyebrow={eyebrow}
      title={title}
      description={description}
      action={
        <Link className={styles.backLink} href="/projects/new">
          ← 更换创建方式
        </Link>
      }
    >
      <div className={styles.mockNotice}>
        <span>
          {realUpload
            ? "原文件将保存到项目对象存储，并保持等待解析状态；解析结果会另建版本，不覆盖原文件。"
            : "只需提供当前知道的部分。确认创建后，项目与诊断卡草稿会保存到你的工作区。"}
        </span>
      </div>

      <nav className={styles.stepper} aria-label="项目创建进度">
        {steps.map((item, index) => {
          const itemStep = (index + 1) as 1 | 2 | 3;
          const state =
            itemStep === step ? styles.stepActive : itemStep < step ? styles.stepDone : "";
          return (
            <div className={`${styles.step} ${state}`} key={item.index}>
              <span>{itemStep < step ? "✓" : item.index}</span>
              <strong>
                {realUpload && item.index === "02" ? "核对上传状态" : item.label}
              </strong>
            </div>
          );
        })}
      </nav>

      <div className={styles.formLayout}>
        <div className={styles.formCard}>{children}</div>
        <aside className={styles.sideNote}>
          <span className={styles.noteIndex}>阅读边界</span>
          <h2>{noteTitle}</h2>
          <p>{note}</p>
          <div className={styles.sideRule}>
            <strong>接下来</strong>
            <span>
              创建后可选择快速开始、AI 引导梳理、材料提取或完整填写；诊断不完整不会锁死整个项目。
            </span>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

export function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? styles.fieldFull : styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function FormSection({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span>{index}</span>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function FormActions({
  step,
  draftSaved,
  createDisabled = false,
  createDisabledLabel = "请先处理队列",
  onBack,
  onNext,
  onSave,
  onCreate,
}: {
  step: 1 | 2 | 3;
  draftSaved: boolean;
  createDisabled?: boolean;
  createDisabledLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  onCreate: () => void;
}) {
  return (
    <footer className={styles.actions}>
      <div className={styles.actionGroup}>
        {step > 1 ? (
          <button className={styles.secondaryButton} type="button" onClick={onBack}>
            ← 返回编辑
          </button>
        ) : null}
        <button className={styles.secondaryButton} type="button" onClick={onSave}>
          {draftSaved ? "草稿已保留在本页" : "暂存本页草稿"}
        </button>
      </div>

      {step < 3 ? (
        <button className={styles.primaryButton} type="button" onClick={onNext}>
          {step === 1 ? "查看处理队列" : "核对并继续"}
          <span>→</span>
        </button>
      ) : (
        <button
          className={styles.primaryButton}
          type="button"
          disabled={createDisabled}
          onClick={onCreate}
        >
          {createDisabled ? createDisabledLabel : "确认创建项目"}
          <span>→</span>
        </button>
      )}
    </footer>
  );
}

export function EmptyMaterialQueue() {
  return (
    <div className={styles.queueArea}>
      <div className={styles.emptyQueue}>
        <span aria-hidden="true">○</span>
        <div>
          <strong>当前不绑定材料</strong>
          <p>
            从 Idea 开始允许先不上传文件。创建后仍可补充 Word、PDF、Excel、CSV、TXT
            和图片。
          </p>
        </div>
      </div>
    </div>
  );
}

export function CreationReview({
  pathLabel,
  title,
  materialSummary,
  persisted = false,
}: {
  pathLabel: string;
  title: string;
  materialSummary: string;
  persisted?: boolean;
}) {
  return (
    <section className={styles.reviewPanel}>
      <div className={styles.reviewStamp}>确认</div>
      <div>
        <span className={styles.reviewKicker}>
          {persisted ? "创建前最后核对 · 原文件已存储" : "创建前最后核对"}
        </span>
        <h2>{title || "未命名论文项目"}</h2>
        <dl>
          <div>
            <dt>创建方式</dt>
            <dd>{pathLabel}</dd>
          </div>
          <div>
            <dt>材料状态</dt>
            <dd>{materialSummary}</dd>
          </div>
          <div>
            <dt>创建结果</dt>
            <dd>生成项目与诊断卡草稿，不直接生成整篇论文</dd>
          </div>
          <div>
            <dt>数据范围</dt>
            <dd>
              {persisted
                ? "原文件已保存到项目对象存储，正文尚未解析"
                : "确认创建后写入当前用户的持久化工作区"}
            </dd>
          </div>
        </dl>
        <p className={styles.reviewWarning}>
          确认后将前往诊断卡。诊断卡仍可编辑，确认后修改会形成待重新确认的新草稿。
        </p>
      </div>
    </section>
  );
}

export { styles as formStyles };
