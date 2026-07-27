"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import {
  type DiagnosisDraft,
  useMockWorkspace,
} from "@/app/lib/MockWorkspaceContext";
import styles from "./diagnosis.module.css";

const diagnosisFields: Array<{
  key: keyof DiagnosisDraft;
  label: string;
  origin: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  {
    key: "title",
    label: "论文题目",
    origin: "用户输入",
    placeholder: "请输入暂定论文题目",
  },
  {
    key: "paperType",
    label: "论文类型",
    origin: "用户输入",
    placeholder: "例如：期刊论文、本科论文",
  },
  {
    key: "language",
    label: "写作语言",
    origin: "用户输入",
    placeholder: "例如：中文、英文或双语",
  },
  {
    key: "researchObject",
    label: "研究对象",
    origin: "用户输入",
    placeholder: "请说明研究对象与范围",
    multiline: true,
  },
  {
    key: "researchQuestion",
    label: "核心研究问题",
    origin: "AI 归纳 · Mock",
    placeholder: "请输入准备回答的核心问题",
    multiline: true,
  },
  {
    key: "method",
    label: "拟采用方法",
    origin: "待用户确认",
    placeholder: "例如：半结构访谈、案例研究；尚未决定可以留空",
    multiline: true,
  },
  {
    key: "requirements",
    label: "文章要求",
    origin: "上传要求 · Mock",
    placeholder: "字数、引用格式、截止日期与其他硬性要求",
    multiline: true,
  },
];

export default function DiagnosisPage() {
  const router = useRouter();
  const {
    dataSource,
    diagnosis,
    diagnosisStatus,
    persistenceError,
    persistenceStatus,
    updateDiagnosis,
    confirmDiagnosis,
    reopenDiagnosis,
  } = useMockWorkspace();

  const confirmed = diagnosisStatus === "confirmed";
  const updated = diagnosisStatus === "updated";
  const missingFields = diagnosisFields.filter(({ key }) => !diagnosis[key].trim());

  const statusCopy = confirmed
    ? {
        kicker: "已确认 · v1",
        title: "已确认版本已经保留",
        detail: "后续写作可读取这份版本。你仍可修改，改动会成为待重新确认的新草稿。",
        seal: "确",
        sealLabel: "CONFIRMED",
      }
    : updated
      ? {
          kicker: "修改草稿 · 待重新确认",
          title: "修改不会覆盖已确认版本",
          detail: "v1 已保留。重新确认前，后续写作仍以此前确认版本为准。",
          seal: "改",
          sealLabel: "RECONFIRM",
        }
      : {
          kicker: "草稿 · 等待确认",
          title: "先确认系统对文章要求的理解",
          detail: "黄色项目表示仍缺少信息；可以带着缺失项继续，但系统不会据此虚构研究方法或数据。",
          seal: "诊",
          sealLabel: "DRAFT",
        };

  async function confirmAndContinue() {
    try {
      await confirmDiagnosis();
      router.push("/projects/demo/outline");
    } catch {
      // The context exposes the persistence error in the status row.
    }
  }

  return (
    <AppShell
      compact
      eyebrow="数字平台中的知识协作机制研究"
      title="项目诊断卡"
      description="这是一张写作前的研究任务确认单。核对题目、问题、方法与要求，再把它交给目录和章节流程。"
      action={
        <Link className={styles.backLink} href="/projects">
          ← 项目列表
        </Link>
      }
    >
      <section
        className={`${styles.statusHero} ${
          confirmed ? styles.statusConfirmed : updated ? styles.statusUpdated : styles.statusDraft
        }`}
        aria-live="polite"
      >
        <div>
          <span className={styles.statusKicker}>{statusCopy.kicker}</span>
          <h2>{statusCopy.title}</h2>
          <p>{statusCopy.detail}</p>
        </div>
        <div className={styles.statusSeal} aria-hidden="true">
          <span>{statusCopy.seal}</span>
          <small>{statusCopy.sealLabel}</small>
        </div>
      </section>

      <div className={styles.metaRow}>
        <MockBadge>{dataSource === "d1" ? "M3 · D1 基础数据" : undefined}</MockBadge>
        <span>诊断清晰度</span>
        <strong>
          {diagnosisFields.length - missingFields.length} / {diagnosisFields.length} 项明确
        </strong>
        <span>{confirmed ? "已确认版本 v1" : updated ? "修改草稿未确认" : "诊断草稿"}</span>
        {persistenceStatus === "loading" ? <span>正在读取基础数据…</span> : null}
        {persistenceError ? <span role="alert">{persistenceError}</span> : null}
      </div>

      <div className={styles.contentGrid}>
        <form className={styles.diagnosisCard} onSubmit={(event) => event.preventDefault()}>
          <header className={styles.cardHeader}>
            <div>
              <span>01</span>
              <h2>系统对项目的理解</h2>
            </div>
            <p>{confirmed ? "确认版本 · 只读" : updated ? "修改草稿 · 可编辑" : "草稿 · 可编辑"}</p>
          </header>

          <div className={styles.fieldList}>
            {diagnosisFields.map((field) => {
              const missing = !diagnosis[field.key].trim();
              const fieldId = `diagnosis-${field.key}`;

              return (
                <div
                  className={`${styles.fieldRow} ${missing ? styles.fieldMissing : ""}`}
                  key={field.key}
                >
                  <label className={styles.fieldLabel} htmlFor={fieldId}>
                    <span>{field.label}</span>
                    <small className={missing ? styles.missingOrigin : styles.origin}>
                      {missing ? "缺失信息" : field.origin}
                    </small>
                  </label>
                  {field.multiline ? (
                    <textarea
                      id={fieldId}
                      value={diagnosis[field.key]}
                      placeholder={field.placeholder}
                      readOnly={confirmed}
                      rows={field.key === "requirements" ? 3 : 2}
                      onChange={(event) => updateDiagnosis(field.key, event.target.value)}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      value={diagnosis[field.key]}
                      placeholder={field.placeholder}
                      readOnly={confirmed}
                      onChange={(event) => updateDiagnosis(field.key, event.target.value)}
                    />
                  )}
                  <span className={styles.fieldState}>
                    {confirmed ? "已确认" : missing ? "需补充" : "可修改"}
                  </span>
                </div>
              );
            })}
          </div>
        </form>

        <aside className={styles.riskPanel}>
          <header>
            <span>02</span>
            <h2>缺失、风险与下一步</h2>
          </header>
          <article className={diagnosis.method.trim() ? styles.resolvedRisk : styles.highRisk}>
            <span>{diagnosis.method.trim() ? "已补充" : "高优先级"}</span>
            <h3>{diagnosis.method.trim() ? "研究方法已有说明" : "研究方法尚未确认"}</h3>
            <p>
              {diagnosis.method.trim()
                ? "系统会把这段内容作为方法边界，但仍不会假定数据已经采集。"
                : "可以先确认文章方向，但结果章节不会根据方法建议生成虚构数据。"}
            </p>
          </article>
          <article className={styles.mediumRisk}>
            <span>缺失材料</span>
            <h3>真实研究数据尚未提供</h3>
            <p>访谈、问卷或实验结果需要后续上传。当前只能规划结果章节，不能生成研究结论。</p>
          </article>
          <article className={styles.scopeNote}>
            <span>下一步</span>
            <ol>
              <li>确认题目、研究问题与文章要求。</li>
              <li>生成并调整论文目录。</li>
              <li>按章节继续补充文献和研究材料。</li>
            </ol>
          </article>
        </aside>
      </div>

      <footer
        className={`${styles.confirmBar} ${
          confirmed ? styles.confirmedBar : updated ? styles.updatedBar : ""
        }`}
      >
        <div>
          <strong>
            {confirmed
              ? "诊断卡已确认，仍可继续修改"
              : updated
                ? "修改草稿等待重新确认"
                : missingFields.length
                  ? `仍有 ${missingFields.length} 项缺失信息`
                  : "诊断信息已填写完整"}
          </strong>
          <span>
            {confirmed
              ? "点击修改后会建立新草稿，不覆盖已确认的 v1。"
              : updated
                ? "重新确认后，目录与后续任务才会读取本次修改。"
                : "确认表示认可当前研究边界，不代表系统已经验证研究结论。"}
          </span>
        </div>
        <div className={styles.confirmActions}>
          {confirmed ? (
            <>
              <button className={styles.secondaryAction} type="button" onClick={reopenDiagnosis}>
                修改诊断卡
              </button>
              <Link className={styles.primaryAction} href="/projects/demo/outline">
                查看论文目录 →
              </Link>
            </>
          ) : (
            <>
              <Link className={styles.secondaryAction} href="/projects/new">
                补充材料
              </Link>
              <button className={styles.primaryAction} type="button" onClick={confirmAndContinue}>
                {updated ? "重新确认并更新目录 →" : "确认并生成目录 →"}
              </button>
            </>
          )}
        </div>
      </footer>
    </AppShell>
  );
}
