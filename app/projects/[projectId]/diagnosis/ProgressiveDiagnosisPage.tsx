"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/AppShell";
import {
  loadM4Diagnosis,
  mutateM4Diagnosis,
} from "@/app/lib/m4-diagnosis-client";
import type { M4DiagnosisWorkspace } from "@/app/lib/m4-diagnosis-contracts";
import {
  diagnosisAuditItems,
  diagnosisEntryModes,
  diagnosisVersions,
  guidedQuestions,
  initialDiagnosisFields,
  materialExtractedFields,
  quickQuestions,
  stopConditions,
  taskReadinessItems,
  type DiagnosisEntryMode,
  type DiagnosisFieldRecord,
  type DiagnosisFieldStatus,
  type DiagnosisSourceType,
  type DiagnosisVersionStatus,
  type GuidanceDepth,
  type GuidanceQuestion,
  type TaskReadinessItem,
} from "@/app/lib/progressive-diagnosis-mock";
import styles from "./progressive-diagnosis.module.css";

type DiagnosisView = "home" | "guide" | "material" | "professional" | "summary";

type AnswerRecord = {
  value: string;
  status: DiagnosisFieldStatus;
  source: DiagnosisSourceType;
};

const statusCopy: Record<DiagnosisFieldStatus, string> = {
  USER_CONFIRMED: "用户已确认",
  AI_INFERRED: "AI 推测，待用户确认",
  PENDING_CONFIRMATION: "已有候选，等待确认",
  UNKNOWN: "当前不知道",
  SKIPPED: "暂时跳过",
  MISSING_MATERIAL: "缺少必要材料",
  NOT_APPLICABLE: "不适用",
};

const sourceCopy: Record<DiagnosisSourceType, string> = {
  USER_INPUT: "用户输入",
  MATERIAL_EXTRACTED: "材料提取",
  AI_RECOMMENDED: "AI 推荐",
  SYSTEM_DERIVED: "系统派生",
  IMPORTED: "外部导入",
};

const versionStatusCopy: Record<DiagnosisVersionStatus, string> = {
  DRAFT: "草稿",
  PENDING_CONFIRMATION: "等待确认",
  CONFIRMED: "已确认",
  SUPERSEDED: "已被新版本取代",
  ARCHIVED: "已归档",
};

const allFieldStatuses = Object.keys(statusCopy) as DiagnosisFieldStatus[];

function confidenceCopy(confidence: DiagnosisFieldRecord["confidence"]) {
  return confidence === "HIGH" ? "高" : confidence === "MEDIUM" ? "中" : "低";
}

function fieldTone(status: DiagnosisFieldStatus) {
  if (status === "USER_CONFIRMED") return styles.toneConfirmed;
  if (status === "AI_INFERRED" || status === "PENDING_CONFIRMATION") {
    return styles.tonePending;
  }
  if (status === "MISSING_MATERIAL") return styles.toneBlocked;
  return styles.toneNeutral;
}

export default function ProgressiveDiagnosisPage({
  projectId,
  persistenceEnabled,
}: {
  projectId: string;
  persistenceEnabled: boolean;
}) {
  const [view, setView] = useState<DiagnosisView>("home");
  const [entryMode, setEntryMode] = useState<DiagnosisEntryMode>("guided");
  const [depth, setDepth] = useState<GuidanceDepth>("standard");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [fields, setFields] = useState<DiagnosisFieldRecord[]>(() =>
    initialDiagnosisFields.map((field) => ({ ...field })),
  );
  const [customAnswer, setCustomAnswer] = useState("");
  const [consecutiveUnknown, setConsecutiveUnknown] = useState(0);
  const [finishReason, setFinishReason] = useState(
    "当前任务已达到最低可执行条件；停止追问不代表诊断失败。",
  );
  const [versions, setVersions] = useState(() =>
    diagnosisVersions.map((version) => ({ ...version })),
  );
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [persistedQuestions, setPersistedQuestions] = useState<GuidanceQuestion[]>(
    [],
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<"active" | "completed" | "cancelled" | null>(null);
  const [latestCardId, setLatestCardId] = useState<string | null>(null);
  const [readiness, setReadiness] =
    useState<TaskReadinessItem[]>(taskReadinessItems);
  const [auditItems, setAuditItems] = useState<string[]>([
    ...diagnosisAuditItems,
  ]);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    persistenceEnabled ? "loading" : "error",
  );
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!persistenceEnabled) return;
    let cancelled = false;
    loadM4Diagnosis(projectId)
      .then((workspace) => {
        if (!cancelled) {
          applyWorkspace(workspace);
          setLoadState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "诊断数据读取失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [persistenceEnabled, projectId]);

  const activeQuestions = useMemo(() => {
    if (persistedQuestions.length) return persistedQuestions;
    if (entryMode === "quick") return quickQuestions;
    const available = guidedQuestions.filter(
      (question) => depth === "deep" || !question.deep_only,
    );
    return available.slice(0, depth === "standard" ? 6 : 10);
  }, [depth, entryMode, persistedQuestions]);

  const currentQuestion =
    activeQuestions[Math.min(questionIndex, activeQuestions.length - 1)];
  const answeredCount = Object.keys(answers).length;

  const groupedFields = useMemo(
    () => ({
      known: fields.filter((field) => field.status === "USER_CONFIRMED"),
      inferred: fields.filter((field) => field.status === "AI_INFERRED"),
      pending: fields.filter((field) =>
        ["PENDING_CONFIRMATION", "UNKNOWN", "SKIPPED", "NOT_APPLICABLE"].includes(
          field.status,
        ),
      ),
      missing: fields.filter((field) => field.status === "MISSING_MATERIAL"),
    }),
    [fields],
  );

  const readyTasks = readiness.filter((item) =>
    ["READY", "READY_WITH_WARNINGS"].includes(item.status),
  );
  const unavailableTasks = readiness.filter(
    (item) => !["READY", "READY_WITH_WARNINGS"].includes(item.status),
  );

  function applyWorkspace(workspace: M4DiagnosisWorkspace) {
    setLatestCardId(workspace.latest_diagnosis_card_id);
    if (workspace.session) {
      setSessionId(workspace.session.id);
      setSessionStatus(workspace.session.status);
      setEntryMode(workspace.session.mode);
      setDepth(workspace.session.depth);
      setPersistedQuestions(workspace.session.questions);
      setQuestionIndex(
        Math.max(
          0,
          workspace.session.questions.findIndex(
            (question) =>
              question.question_id === workspace.session?.current_question_id,
          ),
        ),
      );
      if (workspace.session.fields.length) {
        setFields(
          workspace.session.fields.map((field) => {
            const { id, confirmed_at: confirmedAt, ...editableField } = field;
            void id;
            void confirmedAt;
            return editableField;
          }),
        );
      }
      if (workspace.session.stop_reason) {
        setFinishReason(workspace.session.stop_reason);
      }
    }
    if (workspace.readiness.length) {
      setReadiness(
        workspace.readiness.map((item) => ({
          id: item.task_key,
          task: item.task_name,
          status: item.status,
          reason: item.reason,
          nextAction: item.missing_field_keys.length
            ? `待补充：${item.missing_field_keys.join("、")}`
            : "当前最低条件已满足。",
        })),
      );
    }
    setVersions(
      workspace.versions.map((version) => ({
        id: version.id,
        label: `D${version.version_number}`,
        status: version.status.toUpperCase() as DiagnosisVersionStatus,
        source: "D1 持久化",
        detail: version.confirmed_at
          ? `用户确认于 ${version.confirmed_at}`
          : `创建于 ${version.created_at}`,
      })),
    );
    setConfirmed(
      workspace.versions[0]?.status === "confirmed",
    );
    setAuditItems(
      workspace.audit.length
        ? workspace.audit.map(
            (item) =>
              `${item.action} · ${item.actor_type}${
                item.field_key ? ` · ${item.field_key}` : ""
              }`,
          )
        : [...diagnosisAuditItems],
    );
  }

  async function startPersistentSession(
    mode: DiagnosisEntryMode,
    selectedDepth: GuidanceDepth,
  ) {
    if (!persistenceEnabled) return null;
    setPersistenceBusy(true);
    try {
      const workspace = await mutateM4Diagnosis(projectId, {
        action: "start",
        mode,
        depth: selectedDepth,
      });
      applyWorkspace(workspace);
      setNotice("诊断会话已保存到 D1。");
      return workspace.session?.id ?? null;
    } catch (error) {
      setNotice(
        error instanceof Error ? `保存失败：${error.message}` : "保存失败。",
      );
      return null;
    } finally {
      setPersistenceBusy(false);
    }
  }

  async function resetGuidance(
    mode: DiagnosisEntryMode,
    selectedDepth: GuidanceDepth = depth,
  ) {
    setEntryMode(mode);
    setDepth(selectedDepth);
    setQuestionIndex(0);
    setAnswers({});
    setCustomAnswer("");
    setConsecutiveUnknown(0);
    setNotice("");
    setView("guide");
    setPersistedQuestions([]);
    await startPersistentSession(mode, selectedDepth);
  }

  function updateField(
    fieldKey: string,
    value: string,
    status: DiagnosisFieldStatus,
    source: DiagnosisSourceType,
    question?: GuidanceQuestion,
  ) {
    setFields((current) => {
      const existing = current.find((field) => field.field === fieldKey);
      const nextField: DiagnosisFieldRecord = {
        field: fieldKey,
        label: existing?.label ?? question?.topic ?? fieldKey,
        value,
        status,
        source_type: source,
        source_material_ids:
          question?.source_material_ids ?? existing?.source_material_ids ?? [],
        source_locations:
          question?.source_locations ?? existing?.source_locations ?? [],
        confidence: question?.confidence ?? existing?.confidence ?? "MEDIUM",
        requires_confirmation:
          status === "AI_INFERRED" || status === "PENDING_CONFIRMATION",
        rationale:
          status === "AI_INFERRED" || status === "PENDING_CONFIRMATION"
            ? question?.recommendation_reason ?? "规则候选，等待用户确认。"
            : existing?.rationale ?? "由本次引导回答更新。",
      };
      return existing
        ? current.map((field) => (field.field === fieldKey ? nextField : field))
        : [...current, nextField];
    });
  }

  function finishGuidance(reason: string) {
    setFinishReason(reason);
    setView("summary");
    setNotice(
      persistenceEnabled
        ? "正在创建新的持久化诊断草稿；历史版本不会被覆盖。"
        : "诊断持久化当前未启用，未创建诊断草稿。",
    );
    if (persistenceEnabled && sessionId) {
      void finishPersistentSession(sessionId, reason);
    }
  }

  async function finishPersistentSession(activeSessionId: string, reason: string) {
    setPersistenceBusy(true);
    try {
      const workspace = await mutateM4Diagnosis(projectId, {
        action: "finish",
        session_id: activeSessionId,
        stop_reason: reason,
      });
      applyWorkspace(workspace);
      setNotice("已创建新的 D1 诊断草稿版本；旧版本和审计记录均已保留。");
    } catch (error) {
      setNotice(
        error instanceof Error ? `草稿保存失败：${error.message}` : "草稿保存失败。",
      );
    } finally {
      setPersistenceBusy(false);
    }
  }

  async function persistAnswer(
    question: GuidanceQuestion,
    result: {
      status: DiagnosisFieldStatus;
      source: DiagnosisSourceType;
      value: string;
    },
  ) {
    if (!persistenceEnabled || !sessionId) return;
    setPersistenceBusy(true);
    try {
      const workspace = await mutateM4Diagnosis(projectId, {
        action: "answer",
        session_id: sessionId,
        question_id: question.question_id,
        answer: result.value,
        answer_status: result.status,
        answer_source_type: result.source,
        confidence: question.confidence,
      });
      applyWorkspace(workspace);
    } catch (error) {
      setNotice(
        error instanceof Error ? `答案保存失败：${error.message}` : "答案保存失败。",
      );
    } finally {
      setPersistenceBusy(false);
    }
  }

  async function submitAnswer(
    action:
      | "user"
      | "unknown"
      | "skip"
      | "ai"
      | "later"
      | "not-applicable",
    value = "",
  ) {
    if (!currentQuestion) return;

    const mapped: Record<
      typeof action,
      { status: DiagnosisFieldStatus; source: DiagnosisSourceType; value: string }
    > = {
      user: {
        status: "USER_CONFIRMED",
        source: "USER_INPUT",
        value,
      },
      unknown: {
        status: "UNKNOWN",
        source: "USER_INPUT",
        value: "当前不知道",
      },
      skip: {
        status: "SKIPPED",
        source: "USER_INPUT",
        value: "暂时跳过",
      },
      ai: {
        status: "PENDING_CONFIRMATION",
        source: "SYSTEM_DERIVED",
        value: currentQuestion.recommended_answer,
      },
      later: {
        status: "PENDING_CONFIRMATION",
        source: "USER_INPUT",
        value: "稍后再决定",
      },
      "not-applicable": {
        status: "NOT_APPLICABLE",
        source: "USER_INPUT",
        value: "不适用于当前项目",
      },
    };
    const result = mapped[action];
    await persistAnswer(currentQuestion, result);
    setAnswers((current) => ({
      ...current,
      [currentQuestion.question_id]: {
        value: result.value,
        status: result.status,
        source: result.source,
      },
    }));
    updateField(
      currentQuestion.field_key,
      result.value,
      result.status,
      result.source,
      currentQuestion,
    );
    setCustomAnswer("");

    const nextUnknownCount = action === "unknown" ? consecutiveUnknown + 1 : 0;
    setConsecutiveUnknown(nextUnknownCount);

    if (nextUnknownCount >= 2) {
      finishGuidance(
        "你连续两次选择“不知道”。系统已停止追问，并保留候选答案、所需材料和可开展任务。",
      );
      return;
    }

    if (questionIndex + 1 >= activeQuestions.length) {
      finishGuidance(
        entryMode === "quick"
          ? "快速开始已完成 3 个基础问题。"
          : `已达到${depth === "standard" ? "标准" : "深度"}梳理的问题上限。`,
      );
      return;
    }

    setQuestionIndex((current) => current + 1);
  }

  function updateExistingField(
    fieldName: string,
    patch: Partial<DiagnosisFieldRecord>,
  ) {
    setFields((current) =>
      current.map((field) =>
        field.field === fieldName ? { ...field, ...patch } : field,
      ),
    );
  }

  async function saveCurrentFieldsAndFinish(reason: string) {
    if (!persistenceEnabled) {
      finishGuidance(reason);
      return;
    }
    let activeSessionId = sessionId;
    if (!activeSessionId || sessionStatus !== "active") {
      activeSessionId = await startPersistentSession(entryMode, depth);
    }
    if (!activeSessionId) return;
    setPersistenceBusy(true);
    try {
      await mutateM4Diagnosis(projectId, {
        action: "save_fields",
        session_id: activeSessionId,
        fields: fields.map((field) => ({
          ...field,
        })),
      });
      const workspace = await mutateM4Diagnosis(projectId, {
        action: "finish",
        session_id: activeSessionId,
        stop_reason: reason,
      });
      applyWorkspace(workspace);
      setFinishReason(reason);
      setView("summary");
      setNotice("字段、就绪状态、草稿版本和审计记录已保存到 D1。");
    } catch (error) {
      setNotice(
        error instanceof Error ? `保存失败：${error.message}` : "保存失败。",
      );
    } finally {
      setPersistenceBusy(false);
    }
  }

  async function confirmCurrentDiagnosis() {
    if (confirmed) {
      setNotice("当前确认版本 D3 已保留；再次修改会创建新草稿。");
      return;
    }
    if (persistenceEnabled) {
      if (!latestCardId) {
        setNotice("请先保存当前诊断草稿，再执行确认。");
        return;
      }
      setPersistenceBusy(true);
      try {
        const workspace = await mutateM4Diagnosis(projectId, {
          action: "confirm",
          diagnosis_card_id: latestCardId,
        });
        applyWorkspace(workspace);
        setNotice(
          "已创建新的确认版本；未确认字段仍保留原状态，没有被改写为用户事实。",
        );
      } catch (error) {
        setNotice(
          error instanceof Error ? `确认失败：${error.message}` : "确认失败。",
        );
      } finally {
        setPersistenceBusy(false);
      }
      return;
    }
    setConfirmed(true);
    setVersions((current) => [
      {
        id: "diagnosis-v3",
        label: "D3",
        status: "CONFIRMED",
        source: "用户确认",
        detail:
          "确认当前已知内容；AI 推测和待确认字段仍保留原状态，不会被静默改成用户事实。",
      },
      ...current.map((version) =>
        version.status === "PENDING_CONFIRMATION"
          ? { ...version, status: "SUPERSEDED" as const }
          : version,
      ),
    ]);
    setNotice("已创建确认版本 D3；D1、D2 和字段来源历史均已保留。");
  }

  function renderHome() {
    return (
      <>
        <section className={styles.introBand}>
          <div>
            <span>PROJECT DIAGNOSIS</span>
            <h2>你不需要先懂所有专业问题。</h2>
            <p>
              从你已经知道的部分开始。系统先读已有信息和本次授权材料，再一次解决一个最重要的问题。
            </p>
          </div>
          <div className={styles.minimumCard}>
            <strong>创建项目只需要 3 个答案</strong>
            <ol>
              <li>大概想完成什么</li>
              <li>目前已有材料</li>
              <li>希望 AI 先做什么</li>
            </ol>
          </div>
        </section>

        <section className={styles.modeSection} aria-labelledby="diagnosis-mode-title">
          <div className={styles.sectionHeading}>
            <div>
              <span>01 / 选择进入方式</span>
              <h2 id="diagnosis-mode-title">从适合你的方式开始</h2>
            </div>
            <p>所有方式都可保存草稿、稍后修改，不会强制补齐整张专业表。</p>
          </div>

          <div className={styles.modeGrid}>
            {diagnosisEntryModes.map((mode) => (
              <article
                className={`${styles.modeCard} ${
                  mode.id === "guided" ? styles.modeFeatured : ""
                }`}
                key={mode.id}
              >
                <div className={styles.modeTop}>
                  <span>{mode.index}</span>
                  {mode.id === "guided" ? <strong>推荐</strong> : null}
                </div>
                <h3>{mode.title}</h3>
                <p>{mode.description}</p>
                <dl>
                  <div>
                    <dt>适合</dt>
                    <dd>{mode.fit}</dd>
                  </div>
                  <div>
                    <dt>步骤</dt>
                    <dd>{mode.steps}</dd>
                  </div>
                  <div>
                    <dt>材料</dt>
                    <dd>{mode.material}</dd>
                  </div>
                  <div>
                    <dt>AI 推测</dt>
                    <dd>{mode.inference}</dd>
                  </div>
                </dl>
                {mode.id === "guided" ? (
                  <div className={styles.depthActions}>
                    <button
                      type="button"
                      onClick={() => resetGuidance("guided", "standard")}
                    >
                      标准梳理
                      <small>默认 · 5—8 题</small>
                    </button>
                    <button
                      type="button"
                      onClick={() => resetGuidance("guided", "deep")}
                    >
                      深度梳理
                      <small>主动选择 · 有上限</small>
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.modeAction}
                    type="button"
                    onClick={() => {
                      if (mode.id === "quick") resetGuidance("quick", "standard");
                      if (mode.id === "material") {
                        setEntryMode("material");
                        setView("material");
                        void startPersistentSession("material", "standard");
                      }
                      if (mode.id === "professional") {
                        setEntryMode("professional");
                        setView("professional");
                        void startPersistentSession("professional", "standard");
                      }
                    }}
                    disabled={persistenceBusy}
                  >
                    选择这种方式 →
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.principleStrip}>
          <div>
            <strong>不知道也可以继续</strong>
            <span>不知道、跳过、不适用和稍后补充都是有效状态。</span>
          </div>
          <div>
            <strong>系统候选不是事实</strong>
            <span>规则候选会标注依据、来源、置信度和确认入口。</span>
          </div>
          <div>
            <strong>按任务判断是否足够</strong>
            <span>诊断不完整不会锁死文献探索或题目收窄。</span>
          </div>
        </section>
      </>
    );
  }

  function renderGuide() {
    if (!currentQuestion) return null;
    const answer = answers[currentQuestion.question_id];
    const progress = Math.round(
      ((questionIndex + (answer ? 1 : 0)) / activeQuestions.length) * 100,
    );
    const confirmedFields = fields.filter(
      (field) => field.status === "USER_CONFIRMED",
    );

    return (
      <>
        <section className={styles.guideHeader}>
          <div>
            <button className={styles.textButton} type="button" onClick={() => setView("home")}>
              ← 更换诊断方式
            </button>
            <span>
              {entryMode === "quick"
                ? "快速开始"
                : `AI 引导梳理 · ${depth === "standard" ? "标准" : "深度"}`}
            </span>
            <h2>当前目标：判断题目是否可做，并找到下一步</h2>
          </div>
          <div className={styles.progressCard}>
            <strong>
              {questionIndex + 1} / {activeQuestions.length}
            </strong>
            <span>一次只处理一个关键问题</span>
            <div>
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        <div className={styles.guideLayout}>
          <main className={styles.questionCard}>
            <div className={styles.questionMeta}>
              <span>{currentQuestion.topic}</span>
              <span>阻塞级别 · {currentQuestion.blocking_level}</span>
            </div>
            <h2>{currentQuestion.question}</h2>

            <div className={styles.questionContext}>
              <article>
                <span>为什么要问</span>
                <p>{currentQuestion.why_this_matters}</p>
              </article>
              <article>
                <span>会影响什么</span>
                <p>{currentQuestion.decision_impact}</p>
              </article>
            </div>

            <section className={styles.recommendation}>
              <div className={styles.recommendationLabel}>
                <strong>规则候选 · 待用户确认</strong>
                <span>置信度 {confidenceCopy(currentQuestion.confidence)}</span>
              </div>
              <h3>{currentQuestion.recommended_answer}</h3>
              <p>{currentQuestion.recommendation_reason}</p>
              <div className={styles.sourceList}>
                <span>使用材料</span>
                {currentQuestion.source_locations.length ? (
                  currentQuestion.source_locations.map((location) => (
                    <small key={location}>{location}</small>
                  ))
                ) : (
                  <small>未使用材料 · 属于规则推荐</small>
                )}
              </div>
              <button
                className={styles.acceptRecommendation}
                type="button"
                onClick={() => submitAnswer("user", currentQuestion.recommended_answer)}
              >
                确认采用这个答案
              </button>
              <button
                className={styles.inferenceButton}
                type="button"
                onClick={() => submitAnswer("ai")}
              >
                先保留为待确认候选
              </button>
            </section>

            <section className={styles.answerSection}>
              <span>选择更接近你的答案</span>
              <div className={styles.optionList}>
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => submitAnswer("user", option.label)}
                  >
                    <i>{String.fromCharCode(65 + index)}</i>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>

              <label className={styles.customAnswer}>
                <span>或者用自己的话回答</span>
                <textarea
                  value={customAnswer}
                  onChange={(event) => setCustomAnswer(event.target.value)}
                  placeholder="不需要使用专业术语，写你现在知道的部分即可。"
                  rows={3}
                />
                <button
                  type="button"
                  disabled={!customAnswer.trim()}
                  onClick={() => submitAnswer("user", customAnswer.trim())}
                >
                  使用我的回答 →
                </button>
              </label>

              <div className={styles.escapeActions}>
                <button type="button" onClick={() => submitAnswer("unknown")}>
                  我不知道
                </button>
                <button type="button" onClick={() => submitAnswer("skip")}>
                  暂时跳过
                </button>
                <button type="button" onClick={() => submitAnswer("not-applicable")}>
                  不适用
                </button>
                <button type="button" onClick={() => submitAnswer("later")}>
                  稍后再决定
                </button>
              </div>
            </section>
          </main>

          <aside className={styles.guideSidebar}>
            <section>
              <span>当前已确认</span>
              <strong>{confirmedFields.length} 项用户事实</strong>
              {confirmedFields.slice(0, 4).map((field) => (
                <article key={field.field}>
                  <small>{field.label}</small>
                  <p>{field.value}</p>
                </article>
              ))}
            </section>
            <section>
              <span>本次读取范围</span>
              <ul>
                <li>用户已填写信息</li>
                <li>本次授权材料 2 份</li>
                <li>已有诊断草稿 D1</li>
                <li>项目历史诊断版本</li>
              </ul>
            </section>
            <section className={styles.stopPanel}>
              <span>停止条件</span>
              <p>
                连续两次不知道、需要新材料、达到问题上限或信息已足够时都会停止，不视为失败。
              </p>
            </section>
            <button
              className={styles.finishEarly}
              type="button"
              onClick={() =>
                finishGuidance("你选择“先开始，稍后补充”。未回答字段已保留为待确认。")
              }
            >
              先开始，稍后补充
            </button>
          </aside>
        </div>
      </>
    );
  }

  function renderMaterialExtraction() {
    return (
      <>
        <section className={styles.subpageHeader}>
          <button className={styles.textButton} type="button" onClick={() => setView("home")}>
            ← 返回四种方式
          </button>
          <span>从材料自动提取</span>
          <h2>先看来源，再决定是否写入诊断草稿。</h2>
          <p>以下内容来自本次授权材料。提取成功不等于用户已经确认。</p>
        </section>

        <div className={styles.extractionList}>
          {materialExtractedFields.map((seed) => {
            const field = fields.find((item) => item.field === seed.field) ?? seed;
            return (
              <article className={styles.extractionCard} key={field.field}>
                <header>
                  <div>
                    <span>{field.label}</span>
                    <strong className={fieldTone(field.status)}>
                      {statusCopy[field.status]}
                    </strong>
                  </div>
                  <small>置信度 {confidenceCopy(field.confidence)}</small>
                </header>
                <textarea
                  value={field.value}
                  rows={2}
                  onChange={(event) =>
                    updateExistingField(field.field, {
                      value: event.target.value,
                      status: "PENDING_CONFIRMATION",
                    })
                  }
                />
                <dl>
                  <div>
                    <dt>来源类型</dt>
                    <dd>{sourceCopy[field.source_type]}</dd>
                  </div>
                  <div>
                    <dt>来源位置</dt>
                    <dd>{field.source_locations.join("；") || "没有材料位置"}</dd>
                  </div>
                  <div>
                    <dt>提取或推荐依据</dt>
                    <dd>{field.rationale}</dd>
                  </div>
                </dl>
                <div className={styles.extractionActions}>
                  <button
                    type="button"
                    onClick={() =>
                      updateExistingField(field.field, {
                        status: "USER_CONFIRMED",
                        requires_confirmation: false,
                      })
                    }
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateExistingField(field.field, {
                        status: "USER_CONFIRMED",
                        source_type: "USER_INPUT",
                        requires_confirmation: false,
                        rationale: "用户修改提取结果后确认。",
                      })
                    }
                  >
                    修改后确认
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateExistingField(field.field, {
                        value: "",
                        status: "UNKNOWN",
                        source_type: "USER_INPUT",
                        rationale: "用户拒绝了该提取或推荐结果。",
                      })
                    }
                  >
                    拒绝建议
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className={styles.pageActions}>
          <button
            type="button"
            disabled={persistenceBusy}
            onClick={() =>
              void saveCurrentFieldsAndFinish("材料提取字段已形成待确认诊断草稿。")
            }
          >
            生成暂定诊断摘要 →
          </button>
        </div>
      </>
    );
  }

  function renderProfessionalForm() {
    return (
      <>
        <section className={styles.subpageHeader}>
          <button className={styles.textButton} type="button" onClick={() => setView("home")}>
            ← 返回四种方式
          </button>
          <span>完整专业填写</span>
          <h2>知道多少填多少，状态比“填满”更重要。</h2>
          <p>每个字段的内容、确认状态和来源独立记录；未确定内容不会成为正式事实。</p>
        </section>

        <div className={styles.professionalTable}>
          <header>
            <span>诊断字段</span>
            <span>当前内容</span>
            <span>状态与来源</span>
          </header>
          {fields.map((field) => (
            <article key={field.field}>
              <div>
                <strong>{field.label}</strong>
                <small>{field.rationale}</small>
              </div>
              <textarea
                value={field.value}
                rows={2}
                placeholder="不知道可以留空，并在右侧选择对应状态。"
                onChange={(event) =>
                  updateExistingField(field.field, {
                    value: event.target.value,
                    source_type: "USER_INPUT",
                  })
                }
              />
              <div>
                <select
                  value={field.status}
                  aria-label={`${field.label}状态`}
                  onChange={(event) =>
                    updateExistingField(field.field, {
                      status: event.target.value as DiagnosisFieldStatus,
                      requires_confirmation: [
                        "AI_INFERRED",
                        "PENDING_CONFIRMATION",
                      ].includes(event.target.value),
                    })
                  }
                >
                  {allFieldStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusCopy[status]}
                    </option>
                  ))}
                </select>
                <small>{sourceCopy[field.source_type]}</small>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.pageActions}>
          <button
            type="button"
            disabled={persistenceBusy}
            onClick={() =>
              void saveCurrentFieldsAndFinish("完整专业填写已保存为新诊断草稿。")
            }
          >
            保存为新草稿并查看就绪状态 →
          </button>
        </div>
      </>
    );
  }

  function renderFieldGroup(
    title: string,
    description: string,
    items: DiagnosisFieldRecord[],
    empty: string,
  ) {
    return (
      <section className={styles.summaryGroup}>
        <header>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <span>{items.length} 项</span>
        </header>
        {items.length ? (
          <div className={styles.summaryFieldList}>
            {items.map((field) => (
              <article key={field.field}>
                <div>
                  <strong>{field.label}</strong>
                  <span className={fieldTone(field.status)}>
                    {statusCopy[field.status]}
                  </span>
                </div>
                <p>{field.value || "暂未提供内容"}</p>
                <small>
                  {sourceCopy[field.source_type]} · 置信度{" "}
                  {confidenceCopy(field.confidence)}
                </small>
                {field.source_locations.length ? (
                  <small>来源：{field.source_locations.join("；")}</small>
                ) : null}
                {field.status === "AI_INFERRED" ||
                field.status === "PENDING_CONFIRMATION" ? (
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      onClick={() =>
                        updateExistingField(field.field, {
                          status: "USER_CONFIRMED",
                          requires_confirmation: false,
                        })
                      }
                    >
                      确认
                    </button>
                    <button type="button" onClick={() => setView("professional")}>
                      修改
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateExistingField(field.field, {
                          value: "",
                          status: "UNKNOWN",
                          source_type: "USER_INPUT",
                          rationale: "用户拒绝该建议。",
                        })
                      }
                    >
                      拒绝
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyGroup}>{empty}</p>
        )}
      </section>
    );
  }

  function renderSummary() {
    return (
      <>
        <section className={styles.summaryHero}>
          <div>
            <button className={styles.textButton} type="button" onClick={() => setView("home")}>
              ← 返回诊断首页
            </button>
            <span>暂定诊断摘要 · D2</span>
            <h2>信息不完整，但已经知道现在能做什么。</h2>
            <p>{finishReason}</p>
          </div>
          <div className={styles.summaryScore}>
            <strong>{groupedFields.known.length}</strong>
            <span>项用户已确认事实</span>
            <small>{answeredCount} 个引导问题已处理</small>
          </div>
        </section>

        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        <div className={styles.summaryLayout}>
          <main>
            {renderFieldGroup(
              "当前已知",
              "用户明确确认的内容。",
              groupedFields.known,
              "尚无用户确认事实。",
            )}
            {renderFieldGroup(
              "AI 推测，待确认",
              "推荐内容不会静默成为正式事实。",
              groupedFields.inferred,
              "当前没有 AI 推测字段。",
            )}
            {renderFieldGroup(
              "尚待确认",
              "未知、跳过、候选或不适用内容。",
              groupedFields.pending,
              "当前没有待确认字段。",
            )}
            {renderFieldGroup(
              "缺少的材料",
              "说明材料缺口及其影响。",
              groupedFields.missing,
              "当前没有材料缺口。",
            )}
          </main>

          <aside className={styles.readinessPanel}>
            <section>
              <span>现在可以开展</span>
              {readyTasks.map((task) => (
                <article key={task.id}>
                  <strong>{task.task}</strong>
                  <i>{task.status}</i>
                  <p>{task.reason}</p>
                  <small>{task.nextAction}</small>
                </article>
              ))}
            </section>
            <section>
              <span>暂时不适合开展</span>
              {unavailableTasks.map((task) => (
                <article key={task.id}>
                  <strong>{task.task}</strong>
                  <i>{task.status}</i>
                  <p>{task.reason}</p>
                  <small>{task.nextAction}</small>
                </article>
              ))}
            </section>
            <section className={styles.nextActionsPanel}>
              <span>建议下一步 · 只推荐 3 项</span>
              <Link href="/extensions/external-literature">1. 开始文献探索</Link>
              <button type="button" onClick={() => resetGuidance("guided", "standard")}>
                2. 继续标准梳理
              </button>
              <Link href="/projects/new">3. 补充真实研究材料</Link>
            </section>
          </aside>
        </div>

        <section className={styles.historySection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>版本与审计</span>
              <h2>每次确认都创建新版本</h2>
            </div>
            <p>AI 推测不能直接改变已确认版本，恢复旧版时也必须追加新版本。</p>
          </div>
          <div className={styles.historyGrid}>
            <div className={styles.versionList}>
              {versions.map((version) => (
                <article key={version.id}>
                  <strong>{version.label}</strong>
                  <span>{versionStatusCopy[version.status]}</span>
                  <p>{version.source}</p>
                  <small>{version.detail}</small>
                </article>
              ))}
            </div>
            <div className={styles.auditList}>
              {auditItems.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className={styles.summaryActions}>
          <div>
            <strong>{confirmed ? "确认版本 D3 已创建" : "当前仍是待确认草稿 D2"}</strong>
            <span>确认只确认当前用户认可的边界，不会把 AI 推测自动变成事实。</span>
          </div>
          <div>
            <button
              type="button"
              disabled={persistenceBusy}
              onClick={() =>
                void saveCurrentFieldsAndFinish("用户手动保存当前诊断草稿。")
              }
            >
              暂时保存草稿
            </button>
            <button type="button" onClick={() => setView("professional")}>
              修改单个字段
            </button>
            <Link href="/extensions/external-literature">进入可开展任务</Link>
            <button
              className={styles.confirmButton}
              type="button"
              disabled={persistenceBusy}
              onClick={() => void confirmCurrentDiagnosis()}
            >
              {confirmed ? "已确认 D3" : "确认当前诊断卡"}
            </button>
          </div>
        </footer>
      </>
    );
  }

  if (!persistenceEnabled) {
    return (
      <AppShell
        compact
        eyebrow="项目诊断与提纲"
        title="AI 引导梳理"
        description="当前环境尚未启用诊断持久化，系统不会用临时前端数据替代真实诊断记录。"
        action={
          <Link className={styles.backLink} href="/projects">
            ← 项目列表
          </Link>
        }
      >
        <div className={styles.mockNotice} role="alert">
          <strong>诊断服务当前不可用</strong>
          <span>诊断持久化当前不可用，请稍后重试；当前页面不会创建或确认任何诊断版本。</span>
        </div>
      </AppShell>
    );
  }

  if (loadState !== "ready") {
    return (
      <AppShell
        compact
        eyebrow="项目诊断与提纲"
        title={loadState === "loading" ? "正在读取诊断记录" : "诊断记录暂时不可用"}
        description={
          loadState === "loading"
            ? "正在读取当前项目的诊断会话、字段来源、版本与任务就绪状态。"
            : loadError || "无法读取当前项目的诊断记录。"
        }
        action={
          <Link className={styles.backLink} href="/projects">
            ← 项目列表
          </Link>
        }
      >
        <div className={styles.mockNotice} role={loadState === "loading" ? "status" : "alert"}>
          <strong>{loadState === "loading" ? "正在连接项目数据" : "加载失败"}</strong>
          <span>
            {loadState === "loading"
              ? "加载完成前不会显示临时示例数据。"
              : "请返回项目列表后重试；当前页面不会创建或确认任何诊断版本。"}
          </span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      compact
      eyebrow="项目诊断与提纲 · 内部模式"
      title="AI 引导梳理"
      description="从已有想法、材料和当前困难出发，一次解决一个最重要的问题。不知道也可以继续。"
      action={
        <Link className={styles.backLink} href="/projects">
          ← 项目列表
        </Link>
      }
    >
      <div className={styles.mockNotice}>
        <strong>诊断记录已启用持久化</strong>
        <span>
          会话、回答、字段来源、版本、任务就绪和审计写入 D1；当前候选来自固定问题树与规则，不会伪装成模型结论。
        </span>
      </div>
      {view === "home" ? renderHome() : null}
      {view === "guide" ? renderGuide() : null}
      {view === "material" ? renderMaterialExtraction() : null}
      {view === "professional" ? renderProfessionalForm() : null}
      {view === "summary" ? renderSummary() : null}

      <details className={styles.contractNote}>
        <summary>查看停止规则与数据边界</summary>
        <div>
          <ul>
            {stopConditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
          <p>
            问题、字段状态、来源、置信度、回答、版本和审计由 D1 保存；刷新或重启后仍可恢复。
          </p>
        </div>
      </details>
    </AppShell>
  );
}
