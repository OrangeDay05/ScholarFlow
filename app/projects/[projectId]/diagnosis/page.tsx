import Link from "next/link";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import styles from "./diagnosis.module.css";

const fields = [
  {
    label: "研究主题",
    value: "数字平台中的知识协作机制",
    origin: "用户输入",
    complete: true,
  },
  {
    label: "核心研究问题",
    value: "远程研究团队如何通过平台实践形成共同理解？",
    origin: "AI 归纳 · Mock",
    complete: true,
  },
  {
    label: "研究对象",
    value: "跨机构远程研究团队",
    origin: "用户输入",
    complete: true,
  },
  {
    label: "拟采用方法",
    value: "尚未确认：访谈、案例研究或数字民族志",
    origin: "缺失信息",
    complete: false,
  },
  {
    label: "目标与边界",
    value: "期刊论文 · 中英双语 · 12,000 字 · APA 7th",
    origin: "用户输入",
    complete: true,
  },
  {
    label: "材料范围",
    value: "12 篇用户上传文献；3 份访谈材料待补充",
    origin: "上传材料 · Mock",
    complete: false,
  },
];

export default async function DiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status } = await searchParams;
  const normalizedStatus = Array.isArray(status) ? status[0] : status;
  const confirmed = normalizedStatus === "confirmed";

  return (
    <AppShell
      compact
      eyebrow="数字平台中的知识协作机制研究"
      title="项目诊断卡"
      description="核对系统对研究任务的理解。只有确认后的诊断卡，才能成为正式章节写作的上下文。"
      action={
        <Link className={styles.backLink} href="/projects">
          ← 项目列表
        </Link>
      }
    >
      <section
        className={`${styles.statusHero} ${
          confirmed ? styles.statusConfirmed : styles.statusDraft
        }`}
        aria-label={confirmed ? "诊断卡已确认" : "诊断卡草稿"}
      >
        <div>
          <span className={styles.statusKicker}>
            {confirmed ? "已确认 · v1" : "草稿 · 等待确认"}
          </span>
          <h2>
            {confirmed ? "这张诊断卡可以用于正式写作" : "请先确认研究方法与材料范围"}
          </h2>
          <p>
            {confirmed
              ? "后续章节写作会读取这份确认版本；若材料变化，诊断卡将重新标为“需更新”。"
              : "当前内容包含用户输入、AI 归纳和缺失信息。确认前，通用章节写作保持阻断。"}
          </p>
        </div>
        <div className={styles.statusSeal} aria-hidden="true">
          <span>{confirmed ? "确" : "诊"}</span>
          <small>{confirmed ? "CONFIRMED" : "DRAFT"}</small>
        </div>
      </section>

      <div className={styles.metaRow}>
        <MockBadge />
        <span>诊断清晰度</span>
        <strong>4 / 6 项明确</strong>
        <span>更新于今天 20:36</span>
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.diagnosisCard}>
          <header className={styles.cardHeader}>
            <div>
              <span>01</span>
              <h2>系统对项目的理解</h2>
            </div>
            <p>{confirmed ? "确认版本 · 字段已锁定" : "草稿版本 · 可修改"}</p>
          </header>

          <div className={styles.fieldList}>
            {fields.map((field) => (
              <article
                className={`${styles.fieldRow} ${!field.complete ? styles.fieldMissing : ""}`}
                key={field.label}
              >
                <div className={styles.fieldLabel}>
                  <span>{field.label}</span>
                  <small className={field.complete ? styles.origin : styles.missingOrigin}>
                    {field.origin}
                  </small>
                </div>
                <p>{field.value}</p>
                <span className={styles.fieldState}>
                  {confirmed && field.complete ? "已锁定" : field.complete ? "可修改" : "需补充"}
                </span>
              </article>
            ))}
          </div>
        </section>

        <aside className={styles.riskPanel}>
          <header>
            <span>02</span>
            <h2>风险与下一步</h2>
          </header>
          <article className={styles.highRisk}>
            <span>高优先级</span>
            <h3>研究方法尚未确认</h3>
            <p>当前问题可以支持访谈或案例研究，但尚无材料证明已经完成数据收集。</p>
          </article>
          <article className={styles.mediumRisk}>
            <span>需补材料</span>
            <h3>访谈材料仍为空</h3>
            <p>结果章节不能根据方法建议虚构。请在写作前补充真实研究数据。</p>
          </article>
          <article className={styles.scopeNote}>
            <span>核验范围</span>
            <p>本卡只基于用户输入和演示材料，不包含公开数据库或外部来源核验。</p>
          </article>
        </aside>
      </div>

      <footer className={`${styles.confirmBar} ${confirmed ? styles.confirmedBar : ""}`}>
        <div>
          <strong>{confirmed ? "诊断卡已确认" : "确认前请核对所有黄色缺失项"}</strong>
          <span>
            {confirmed
              ? "已确认版本将进入编辑器；后续修改仍会保留版本记录。"
              : "确认代表你认可当前研究边界，不代表系统已验证研究结论。"}
          </span>
        </div>
        <div className={styles.confirmActions}>
          {confirmed ? (
            <>
              <Link className={styles.secondaryAction} href="/projects/demo/diagnosis">
                返回草稿视图
              </Link>
              <Link className={styles.primaryAction} href="/projects/demo/editor">
                进入论文编辑器 →
              </Link>
            </>
          ) : (
            <>
              <Link className={styles.secondaryAction} href="/projects/new">
                补充材料
              </Link>
              <Link
                className={styles.primaryAction}
                href="/projects/demo/diagnosis?status=confirmed"
              >
                确认诊断卡（演示） →
              </Link>
            </>
          )}
        </div>
      </footer>
    </AppShell>
  );
}
