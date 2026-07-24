import Link from "next/link";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import styles from "./forms.module.css";

type FormScaffoldProps = {
  eyebrow: string;
  title: string;
  description: string;
  noteTitle: string;
  note: string;
  children: React.ReactNode;
};

export function FormScaffold({
  eyebrow,
  title,
  description,
  noteTitle,
  note,
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
        <span>本页是 M1 表单骨架。输入不会保存，文件不会离开本机。</span>
      </div>
      <div className={styles.formLayout}>
        <div className={styles.formCard}>{children}</div>
        <aside className={styles.sideNote}>
          <span className={styles.noteIndex}>阅读边界</span>
          <h2>{noteTitle}</h2>
          <p>{note}</p>
          <div className={styles.sideRule}>
            <strong>接下来</strong>
            <span>所有材料都会先进入可修改的诊断卡草稿，不会直接生成整篇论文。</span>
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

export function FormActions({ secondary = "保存为草稿" }: { secondary?: string }) {
  return (
    <footer className={styles.actions}>
      <button className={styles.secondaryButton} type="button" aria-disabled="true">
        {secondary}
        <span>M2 开放</span>
      </button>
      <Link className={styles.primaryButton} href="/projects/demo/diagnosis">
        生成诊断卡草稿
        <span>→</span>
      </Link>
    </footer>
  );
}

export function UploadQueue({
  files,
  loading = false,
}: {
  files: Array<{
    name: string;
    meta: string;
    state: "等待处理" | "读取成功" | "读取失败";
  }>;
  loading?: boolean;
}) {
  return (
    <div className={styles.queue} aria-label="静态文件上传队列">
      <div className={styles.queueHeading}>
        <div>
          <strong>演示上传队列</strong>
          <span>Mock · 不会真实上传</span>
        </div>
        <small>{loading ? "正在读取演示材料" : `${files.length} 个演示文件`}</small>
      </div>
      {files.map((file, index) => {
        const shownState = loading && index === 0 ? "正在处理" : file.state;
        const tone =
          shownState === "读取成功"
            ? styles.queueSuccess
            : shownState === "读取失败"
              ? styles.queueFailure
              : shownState === "正在处理"
                ? styles.queueLoading
                : styles.queueWaiting;

        return (
          <div className={styles.queueRow} key={file.name}>
            <span className={styles.fileType}>{file.name.split(".").pop()?.toUpperCase()}</span>
            <div className={styles.fileCopy}>
              <strong>{file.name}</strong>
              <small>{file.meta}</small>
            </div>
            <span className={`${styles.queueState} ${tone}`}>{shownState}</span>
          </div>
        );
      })}
    </div>
  );
}

export { styles as formStyles };
