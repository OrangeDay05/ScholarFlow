"use client";

import Link from "next/link";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import type {
  FileQueueItem,
  FileQueueStatus,
} from "@/app/lib/MockWorkspaceContext";
import { PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED } from "@/app/lib/progressive-diagnosis-features";
import styles from "./forms.module.css";

type FormScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  noteTitle: string;
  note: string;
  step: 1 | 2 | 3;
  children: React.ReactNode;
};

const steps = [
  { index: "01", label: "填写与上传" },
  { index: "02", label: "核对处理队列" },
  { index: "03", label: "确认创建" },
] as const;

const queueCopy: Record<
  FileQueueStatus,
  { label: string; detail: string; tone: string }
> = {
  queued: {
    label: "等待处理",
    detail: "材料已进入队列，尚未开始读取",
    tone: styles.queueWaiting,
  },
  parsing: {
    label: "正在解析",
    detail: "正在模拟识别结构与字段",
    tone: styles.queueLoading,
  },
  success: {
    label: "解析成功",
    detail: "材料可供诊断卡草稿读取",
    tone: styles.queueSuccess,
  },
  failed: {
    label: "解析失败",
    detail: "显示失败原因，并允许重试或取消",
    tone: styles.queueFailure,
  },
  cancelled: {
    label: "已取消",
    detail: "材料不会进入本次项目",
    tone: styles.queueCancelled,
  },
};

export function FormScaffold({
  eyebrow,
  title,
  description,
  noteTitle,
  note,
  step,
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
        <MockBadge />
        <span>
          {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED
            ? "本页是 M3 增量前端 Mock。只需提供当前知道的部分，文件不会真实上传或解析。"
            : "本页是 M2 前端演示流程。文件不会上传或解析，项目不会写入数据库。"}
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
              <strong>{item.label}</strong>
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
              {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED
                ? "创建后可选择快速开始、AI 引导梳理、材料提取或完整填写；诊断不完整不会锁死整个项目。"
                : "创建后只会生成可修改的诊断卡草稿。确认诊断卡后才进入提纲与章节工作流。"}
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
  onBack,
  onNext,
  onSave,
  onCreate,
}: {
  step: 1 | 2 | 3;
  draftSaved: boolean;
  createDisabled?: boolean;
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
          {draftSaved ? "草稿已保存 · Mock" : "保存草稿"}
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
          {createDisabled ? "请先处理队列" : "确认创建项目"}
          <span>→</span>
        </button>
      )}
    </footer>
  );
}

export function QueueStateLegend() {
  return (
    <div className={styles.stateLegend} aria-label="文件队列五种状态">
      {(
        ["queued", "parsing", "success", "failed", "cancelled"] as FileQueueStatus[]
      ).map((status) => (
        <div className={styles.stateLegendItem} key={status}>
          <span className={`${styles.queueState} ${queueCopy[status].tone}`}>
            {queueCopy[status].label}
          </span>
          <small>{queueCopy[status].detail}</small>
        </div>
      ))}
    </div>
  );
}

export function UploadQueue({
  files,
  onSetStatus,
  onRetry,
}: {
  files: FileQueueItem[];
  onSetStatus: (id: string, status: FileQueueStatus) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <div className={styles.queueArea}>
      <QueueStateLegend />
      <div className={styles.queue} aria-label="Mock 文件上传队列">
        <div className={styles.queueHeading}>
          <div>
            <strong>本次材料队列</strong>
            <span>Mock · 不会真实上传</span>
          </div>
          <small>{files.length} 个演示文件</small>
        </div>

        {files.map((file) => {
          const state = queueCopy[file.status];
          return (
            <div className={styles.queueRow} key={file.id}>
              <span className={styles.fileType}>
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
              <div className={styles.fileCopy}>
                <strong>{file.name}</strong>
                <small>
                  {file.size} · {file.kind}
                </small>
                <small>{file.detail}</small>
              </div>
              <div className={styles.queueControls}>
                <span className={`${styles.queueState} ${state.tone}`}>
                  {state.label}
                </span>
                {file.status === "queued" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSetStatus(file.id, "parsing")}
                    >
                      开始解析
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetStatus(file.id, "cancelled")}
                    >
                      取消
                    </button>
                  </>
                ) : null}
                {file.status === "parsing" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSetStatus(file.id, "success")}
                    >
                      完成解析
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetStatus(file.id, "cancelled")}
                    >
                      取消
                    </button>
                  </>
                ) : null}
                {file.status === "failed" ? (
                  <>
                    <button type="button" onClick={() => onRetry(file.id)}>
                      重试
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetStatus(file.id, "cancelled")}
                    >
                      取消
                    </button>
                  </>
                ) : null}
                {file.status === "success" || file.status === "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => onSetStatus(file.id, "queued")}
                  >
                    重新排队
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyMaterialQueue() {
  return (
    <div className={styles.queueArea}>
      <QueueStateLegend />
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
}: {
  pathLabel: string;
  title: string;
  materialSummary: string;
}) {
  return (
    <section className={styles.reviewPanel}>
      <div className={styles.reviewStamp}>确认</div>
      <div>
        <span className={styles.reviewKicker}>创建前最后核对 · Mock</span>
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
            <dd>仅保存在当前页面内存；刷新后恢复演示数据</dd>
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
