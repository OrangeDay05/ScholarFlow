"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { productSkills } from "@/app/lib/m1-mock";
import {
  type TaskStatus,
  useMockWorkspace,
} from "@/app/lib/MockWorkspaceContext";
import { V042_INCREMENTAL_MOCK_ENABLED } from "@/app/lib/v042-features";
import styles from "./Editor.module.css";

type EditorClientProps = {
  projectId: string;
};

type VisibleTaskStatus = TaskStatus | "queued";
type AssistantTab = "materials" | "evidence" | "tasks";

const sectionCopy: Record<
  string,
  {
    kicker: string;
    lead: string;
    paragraphs: string[];
    subheading: string;
    note: string;
  }
> = {
  abstract: {
    kicker: "ABSTRACT",
    lead:
      "本文关注数字平台如何改变跨机构研究团队的知识协作，并以可追溯性、反馈可见性与知识重组为分析切口。",
    paragraphs: [
      "研究使用用户上传的访谈编码与平台协作文献作为当前证据边界，不扩展到尚未核验的外部来源。",
      "当前摘要仍需等待结果材料确认，因此结论性表述被保留为待补充状态。",
    ],
    subheading: "摘要状态",
    note: "结果材料尚未确认，系统不会生成具体研究结果或统计数值。",
  },
  introduction: {
    kicker: "INTRODUCTION",
    lead:
      "数字平台正在重塑知识生产与组织协作的基本方式。与传统的信息系统不同，平台不仅承载内容，也通过权限、接口与互动规则重新分配知识的可见性和流动路径。",
    paragraphs: [
      "现有研究分别从技术采纳、组织学习与在线协作解释这一变化，但对于平台机制如何在跨团队情境中形成可持续的知识协作，仍缺少能够连接规则设计、参与行为与协作结果的整合性讨论。",
      "本文以数字平台中的项目团队为研究对象，尝试回答两个相互关联的问题：平台规则如何影响成员贡献与复用知识的意愿；不同协作情境下，哪些机制能够降低协调成本并维持知识质量。",
    ],
    subheading: "研究切口",
    note: "此处需要补充研究对象的具体范围，并回到上传原文核对“协调成本”的定义。",
  },
  literature: {
    kicker: "LITERATURE REVIEW",
    lead:
      "现有文献主要从平台治理、组织学习与协同知识生产三条路径解释数字平台中的合作关系。",
    paragraphs: [
      "平台治理研究强调规则与权限设计，组织学习研究关注知识如何被吸收与重用，协同知识生产则讨论参与者如何在互动中建立共同理解。",
      "三类研究的概念边界并不完全一致，当前版本只保留已上传原文能够直接或间接支持的综合判断。",
    ],
    subheading: "综述缺口",
    note: "文献矩阵仍在整理。未核验来源不会被写入正式引用。",
  },
  method: {
    kicker: "METHOD",
    lead:
      "本研究拟采用质性内容分析，考察跨机构远程研究团队如何在平台互动中形成可追溯的协作实践。",
    paragraphs: [
      "分析单位暂定为团队讨论记录中的任务协调、证据交换与决策确认片段。",
      "方法描述仍等待用户确认样本来源、筛选标准和编码流程，系统不会补写不存在的访谈或样本。",
    ],
    subheading: "方法边界",
    note: "诊断卡中的研究方法尚未完整确认，正式生成前需要补充。",
  },
  results: {
    kicker: "RESULTS & DISCUSSION",
    lead:
      "当前结果章节只有讨论框架，没有足够数据支持任何经验性结论。",
    paragraphs: [
      "可追溯性、反馈可见性和知识重组是待检验的三个分析维度，而不是已经得到数据验证的结果。",
      "在访谈编码文件解析成功并经用户授权前，本节只展示缺失信息与分析计划。",
    ],
    subheading: "缺少数据",
    note: "interview-coding.csv 当前解析失败。系统不会编造结果、比例、样本量或访谈原话。",
  },
  conclusion: {
    kicker: "CONCLUSION",
    lead:
      "结论章节将在研究问题、方法与结果均获得材料支持后再生成。",
    paragraphs: [
      "当前只能回顾研究目标与预期贡献，不能提前宣称研究发现。",
      "后续需要检查结论是否逐项回应研究问题，并与结果章节使用一致的概念范围。",
    ],
    subheading: "结论前置条件",
    note: "结果章节未完成，结论性主张暂不可生成。",
  },
};

const evidenceItems = [
  {
    id: "evidence-direct",
    level: "direct",
    label: "直接支持",
    claim: "可追溯的知识交换有助于降低跨团队协调成本。",
    source: "platform-collaboration-review.pdf",
    page: "第 4 页",
    paragraph: "第 2 段",
    quote: "协作记录使团队能够回看决策依据，并减少重复确认。",
    warning: "",
  },
  {
    id: "evidence-indirect",
    level: "indirect",
    label: "间接支持",
    claim: "反馈可见性可能提高成员持续贡献知识的意愿。",
    source: "platform-collaboration-review.pdf",
    page: "第 7 页",
    paragraph: "第 1 段",
    quote: "公开反馈与贡献者的持续参与存在关联。",
    warning: "原文未直接讨论本项目的跨机构研究团队，只能作为间接支持。",
  },
  {
    id: "evidence-unverified",
    level: "unverified",
    label: "无法确认",
    claim: "平台规则可使跨团队知识复用率提升 35%。",
    source: "未找到对应上传材料",
    page: "—",
    paragraph: "—",
    quote: "无可核对原文",
    warning: "高风险：当前上传材料中找不到该数值，不得作为论文事实或正式引用。",
  },
] as const;

const taskLabels: Record<VisibleTaskStatus, string> = {
  idle: "等待执行",
  queued: "已进入队列",
  running: "正在运行",
  success: "任务成功",
  failed: "任务失败",
  cancelled: "任务已取消",
};

const taskTone: Record<VisibleTaskStatus, string> = {
  idle: "idle",
  queued: "queued",
  running: "running",
  success: "success",
  failed: "failed",
  cancelled: "cancelled",
};

const statusText: Record<string, string> = {
  success: "可用",
  parsing: "解析中",
  queued: "排队中",
  failed: "解析失败",
  cancelled: "已取消",
};

const skillGroups = [
  { label: "项目规划", skillIds: ["project-diagnosis"] },
  {
    label: "写作与资料",
    skillIds: ["literature-matrix", "chapter-writing", "revision"],
  },
  { label: "检查与验证", skillIds: ["consistency", "evidence"] },
] as const;

function contentForVersion(id: string, summary: string) {
  if (id.includes("1")) {
    return "平台是团队协作的重要工具。它能够帮助成员交流信息，并在一定程度上提高工作效率。";
  }
  if (id.includes("2")) {
    return "数字平台通过信息共享与反馈机制支持团队协作，但其作用取决于具体规则与参与情境。";
  }
  return `数字平台通过可追溯性、反馈可见性与知识重组三类机制影响跨团队协作。${summary}`;
}

function statusMessage(
  status: VisibleTaskStatus,
  selectedSkillId: string,
  usingFallback: boolean,
  contextMessage: string,
) {
  const operation =
    selectedSkillId === "project-diagnosis"
      ? "更新诊断与提纲"
      : selectedSkillId === "literature-matrix"
        ? "生成文献矩阵"
        : selectedSkillId === "consistency" || selectedSkillId === "evidence"
          ? "生成检查报告"
          : "创建新的章节版本";
  if (status === "queued") {
    return `${usingFallback ? "DeepSeek 备用模型" : "ChatGPT 主模型"}已接收任务，等待执行 · Mock`;
  }
  if (status === "running") {
    return `${usingFallback ? "DeepSeek 备用模型" : "ChatGPT 主模型"}正在${operation} · Mock`;
  }
  if (
    status === "success" &&
    (selectedSkillId === "consistency" || selectedSkillId === "evidence")
  ) {
    return "检查完成：只生成报告，没有直接改写正文 · Mock";
  }
  if (status === "success" && selectedSkillId === "project-diagnosis") {
    return "诊断任务完成：生成了待用户核对的草稿，不会自动确认 · Mock";
  }
  if (status === "success" && selectedSkillId === "literature-matrix") {
    return "文献矩阵已生成：仅整理已授权上传材料 · Mock";
  }
  if (status === "success" && usingFallback) {
    return "备用模型任务完成：已创建新版本，原版本未覆盖 · Mock";
  }
  return contextMessage;
}

export default function EditorClient({ projectId }: EditorClientProps) {
  const {
    dataSource,
    files,
    diagnosisStatus,
    outline,
    persistenceError,
    persistenceStatus,
    selectedSectionId,
    setSelectedSectionId,
    selectedSkillId,
    setSelectedSkillId,
    selectedMaterialIds,
    toggleMaterial,
    taskStatus,
    taskMessage,
    runMockTask,
    cancelMockTask,
    failMockTask,
    versions,
    restoreVersion,
    saveCurrentSection,
    unsavedChanges,
    setUnsavedChanges,
  } = useMockWorkspace();

  const [queued, setQueued] = useState(false);
  const [reportTaskStatus, setReportTaskStatus] = useState<TaskStatus>("idle");
  const [usingFallback, setUsingFallback] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>(["v3", "v2"]);
  const [notice, setNotice] = useState("");
  const [assistantTab, setAssistantTab] = useState<AssistantTab>("materials");
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentScrollRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const claimRefs = useRef<Record<string, HTMLElement | null>>({});
  const initialSectionHandledRef = useRef(false);

  const selectedSkill = useMemo(
    () => productSkills.find((skill) => skill.id === selectedSkillId) ?? productSkills[2],
    [selectedSkillId],
  );
  const selectedSection =
    outline.find((section) => section.id === selectedSectionId) ?? outline[1];
  const leftHidden = focusMode || leftCollapsed;
  const rightHidden = focusMode || rightCollapsed;
  const blocked = selectedSkillId === "chapter-writing" && diagnosisStatus !== "confirmed";
  const isReportOnly = selectedSkillId === "consistency" || selectedSkillId === "evidence";
  const createsVersion =
    selectedSkillId === "chapter-writing" || selectedSkillId === "revision";
  const usesLocalTask = !createsVersion;
  const readableSelectedMaterials = files.filter(
    (file) => selectedMaterialIds.includes(file.id) && file.status === "success",
  );
  const materialBlocked = readableSelectedMaterials.length === 0;
  const skillAvailability = (skillId: string) => {
    if (skillId === "project-diagnosis") {
      return { enabled: true, reason: "可随时更新诊断卡与论文目录。" };
    }
    if (skillId === "literature-matrix" || skillId === "evidence") {
      return readableSelectedMaterials.length > 0
        ? { enabled: true, reason: "已找到本次授权且解析成功的材料。" }
        : { enabled: false, reason: "需先授权至少一份解析成功的材料。" };
    }
    if (skillId === "chapter-writing") {
      if (diagnosisStatus !== "confirmed") {
        return { enabled: false, reason: "需先确认诊断卡。" };
      }
      if (!selectedSection) {
        return { enabled: false, reason: "需先选择当前章节。" };
      }
      return readableSelectedMaterials.length > 0
        ? { enabled: true, reason: "诊断、章节与材料条件已满足。" }
        : { enabled: false, reason: "需先授权至少一份解析成功的材料。" };
    }
    return selectedSection
      ? { enabled: true, reason: "当前章节已经选定。" }
      : { enabled: false, reason: "需先选择当前章节。" };
  };
  const selectedSkillAvailability = skillAvailability(selectedSkillId);
  const visibleTaskStatus: VisibleTaskStatus = queued
    ? "queued"
    : usesLocalTask
      ? reportTaskStatus
      : taskStatus;
  const displayedTaskMessage = statusMessage(
    visibleTaskStatus,
    selectedSkillId,
    usingFallback,
    taskMessage,
  );
  const compareVersions = compareIds
    .map((id) => versions.find((version) => version.id === id))
    .filter((version): version is (typeof versions)[number] => Boolean(version));

  useEffect(() => {
    if (initialSectionHandledRef.current) return;
    const querySection = new URLSearchParams(window.location.search).get("section");
    const matched = outline.find(
      (section) => section.id === querySection || section.index === querySection,
    );
    if (matched) {
      setSelectedSectionId(matched.id);
      requestAnimationFrame(() => {
        sectionRefs.current[matched.id]?.scrollIntoView({ block: "start" });
      });
    }
    initialSectionHandledRef.current = true;
  }, [outline, setSelectedSectionId]);

  useEffect(() => {
    const root = documentScrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const sectionId = (visible[0]?.target as HTMLElement | undefined)?.dataset.sectionId;
        if (!sectionId) return;
        setSelectedSectionId(sectionId);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("section", sectionId);
        window.history.replaceState(null, "", nextUrl);
      },
      {
        root,
        rootMargin: "-12% 0px -58% 0px",
        threshold: [0.08, 0.24, 0.5],
      },
    );
    Object.values(sectionRefs.current).forEach((section) => {
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [outline, setSelectedSectionId]);

  useEffect(
    () => () => {
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    },
    [],
  );

  function selectSection(id: string) {
    setSelectedSectionId(id);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("section", id);
    window.history.replaceState(null, "", nextUrl);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function focusEvidence(evidenceId: string) {
    setSelectedSkillId("evidence");
    setAssistantTab("evidence");
    setActiveEvidenceId(evidenceId);
    setFocusMode(false);
    setRightCollapsed(false);
    setNotice("已在 AI 工作台中定位对应证据卡。");
    requestAnimationFrame(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-evidence-id="${evidenceId}"]`),
      );
      cards.find((card) => card.getClientRects().length > 0)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function focusClaim(evidenceId: string) {
    setActiveEvidenceId(evidenceId);
    setFocusMode(false);
    setLeftCollapsed(false);
    claimRefs.current[evidenceId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setNotice("已在正文中定位并高亮对应论断。");
  }

  function runTask() {
    if (!selectedSkillAvailability.enabled) return;
    if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    setNotice("");
    setUsingFallback(false);
    setQueued(true);
    if (usesLocalTask) setReportTaskStatus("idle");
    queueTimerRef.current = setTimeout(() => {
      setQueued(false);
      if (usesLocalTask) {
        setReportTaskStatus("running");
        reportTimerRef.current = setTimeout(() => setReportTaskStatus("success"), 850);
      } else {
        runMockTask();
      }
    }, 450);
  }

  function simulateFailure() {
    if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    setQueued(false);
    if (usesLocalTask) {
      setReportTaskStatus("failed");
    } else {
      failMockTask();
    }
  }

  function cancelTask() {
    if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    setQueued(false);
    if (usesLocalTask) {
      setReportTaskStatus("cancelled");
    } else {
      cancelMockTask();
    }
  }

  function retryWithFallback() {
    if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    setUsingFallback(true);
    setQueued(true);
    queueTimerRef.current = setTimeout(() => {
      setQueued(false);
      if (usesLocalTask) {
        setReportTaskStatus("running");
        reportTimerRef.current = setTimeout(() => setReportTaskStatus("success"), 850);
      } else {
        runMockTask();
      }
    }, 450);
  }

  function chooseComparison(id: string) {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current.slice(-1), id];
    });
  }

  async function handleRestore(id: string) {
    try {
      await restoreVersion(id);
      setNotice(
        dataSource === "d1"
          ? "已从所选版本创建新的 D1 恢复版本；历史版本均未覆盖。"
          : "已从所选版本创建一个新的恢复版本；历史版本均未覆盖。· Mock",
      );
    } catch {
      setNotice("恢复失败，请查看基础数据状态提示。");
    }
  }

  function renderOutlinePanel() {
    return (
      <>
        <div className={styles.panelHeading}>
          <div>
            <p>STRUCTURE</p>
            <h2>论文目录</h2>
          </div>
          <span className={styles.mockLabel}>{dataSource === "d1" ? "D1" : "MOCK"}</span>
        </div>

        <nav className={styles.outline} aria-label="论文章节">
          {outline.map((section) => {
            const current = section.id === selectedSection.id;
            return (
              <button
                aria-current={current ? "page" : undefined}
                className={current ? styles.outlineActive : styles.outlineItem}
                key={section.id}
                onClick={() => selectSection(section.id)}
                type="button"
              >
                <span className={styles.outlineIndex}>{section.index}</span>
                <span className={styles.outlineCopy}>
                  <strong>{section.title}</strong>
                  <small>
                    {section.words.toLocaleString()} 字 · {section.status}
                  </small>
                </span>
                {section.status === "缺少材料" ? (
                  <span className={styles.alertDot} title="缺少材料" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className={styles.materialSummary}>
          <div className={styles.sectionLabel}>
            <span>本节可读材料</span>
            <span>
              {readableSelectedMaterials.length} / {files.length} 已授权
            </span>
          </div>
          {files.slice(0, 3).map((material) => (
            <div className={styles.materialMini} key={material.id}>
              <span className={styles.fileMark}>{material.kind.slice(0, 1)}</span>
              <span>
                <strong>{material.kind}</strong>
                <small>{statusText[material.status]}</small>
              </span>
            </div>
          ))}
          <p className={styles.scopeNote}>
            只读取本次明确勾选且解析成功的材料，不自动读取整个项目。
          </p>
        </div>
      </>
    );
  }

  function renderAssistantPanel() {
    const canCancel = visibleTaskStatus === "queued" || visibleTaskStatus === "running";
    const taskFailed = visibleTaskStatus === "failed";
    const primaryLabel = isReportOnly
      ? "运行并生成检查报告"
      : selectedSkillId === "literature-matrix"
        ? "运行并生成文献矩阵"
        : selectedSkillId === "project-diagnosis"
          ? "运行项目诊断"
          : "运行并创建新版本";

    return (
      <div className={styles.assistantPanel}>
        <div className={styles.assistantScroll} data-assistant-scroll>
        <div className={styles.panelHeading}>
          <div>
            <p>AI WORKSPACE</p>
            <h2>AI 工作台</h2>
          </div>
          <span className={styles.mockLabel}>MOCK</span>
        </div>

        <div className={styles.assistantIntro}>
          <strong>你想让 AI 完成什么？</strong>
          <span>AI 将读取当前项目上下文和你本次授权的材料。</span>
        </div>

        {V042_INCREMENTAL_MOCK_ENABLED ? (
          <details className={styles.extensionEntry} data-v042-extension-entry>
            <summary>
              <span>
                <strong>研究扩展</strong>
                <small>V0.4.2 · 6 个独立 Mock 工作区</small>
              </span>
              <span aria-hidden="true">＋</span>
            </summary>
            <div>
              <Link href="/extensions/idea-exploration">Idea 探索</Link>
              <Link href="/extensions/external-literature">外部文献</Link>
              <Link href="/extensions/advanced-review">高级审稿</Link>
              <Link href="/extensions/submission-revision">投稿返修</Link>
              <Link href="/extensions/research-figures">科研图件</Link>
              <Link href="/extensions/presentations">PPT</Link>
            </div>
          </details>
        ) : null}

        <section className={styles.skillSection} aria-labelledby="skill-title">
          <div className={styles.sectionLabel} id="skill-title">
            <span>选择产品 Skill</span>
            <span>6 项</span>
          </div>
          <div className={styles.skillGroups}>
            {skillGroups.map((group) => (
              <div className={styles.skillGroup} key={group.label}>
                <strong className={styles.skillGroupLabel}>{group.label}</strong>
                <div className={styles.skillList}>
                  {group.skillIds.map((skillId) => {
                    const skill = productSkills.find((item) => item.id === skillId);
                    if (!skill) return null;
                    const selected = skill.id === selectedSkillId;
                    const availability = skillAvailability(skill.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`${selected ? styles.skillActive : styles.skillButton} ${
                          availability.enabled ? "" : styles.skillUnavailable
                        }`}
                        disabled={!availability.enabled}
                        key={skill.id}
                        onClick={() => {
                          setSelectedSkillId(skill.id);
                          setNotice("");
                        }}
                        title={availability.enabled ? skill.description : availability.reason}
                        type="button"
                      >
                        <span className={styles.skillIndex}>{skill.index}</span>
                        <span>
                          <strong>{skill.title}</strong>
                          <small>
                            {availability.enabled ? skill.description : availability.reason}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.taskPreparation} aria-label="任务准备状态">
          <div className={styles.sectionLabel}>
            <span>任务准备状态</span>
            <span>{selectedSkillAvailability.enabled ? "可以配置" : "条件未满足"}</span>
          </div>
          <div className={styles.preparationRows}>
            <div className={diagnosisStatus === "confirmed" ? styles.preparationReady : styles.preparationWarning}>
              <span>{diagnosisStatus === "confirmed" ? "✓" : "!"}</span>
              <strong>
                {diagnosisStatus === "confirmed" ? "诊断卡已确认" : "诊断卡尚未确认"}
              </strong>
            </div>
            <div className={styles.preparationReady}>
              <span>✓</span>
              <strong>当前章节：{selectedSection.title}</strong>
            </div>
            <div className={selectedMaterialIds.length ? styles.preparationReady : styles.preparationWarning}>
              <span>{selectedMaterialIds.length ? "✓" : "!"}</span>
              <strong>
                已授权 {selectedMaterialIds.length} 份材料 · {readableSelectedMaterials.length} 份可读
              </strong>
            </div>
          </div>
          <p>{selectedSkillAvailability.reason}</p>
          <button
            disabled={!selectedSkillAvailability.enabled}
            onClick={() => {
              setAssistantTab("materials");
              requestAnimationFrame(() => {
                const panels = Array.from(
                  document.querySelectorAll<HTMLElement>("[data-task-configuration]"),
                );
                panels.find((panel) => panel.getClientRects().length > 0)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              });
            }}
            type="button"
          >
            {selectedSkillId === "chapter-writing"
              ? "下一步：配置写作任务"
              : `下一步：配置${selectedSkill.title}`}
          </button>
          {blocked ? (
            <Link href={`/projects/${projectId}/diagnosis?status=draft`}>
              返回诊断卡确认 →
            </Link>
          ) : null}
        </section>

        <div className={styles.assistantTabs} role="tablist" aria-label="AI 工作台上下文">
          {(
            [
              ["materials", "本次材料授权"],
              ["evidence", "引用证据"],
              ["tasks", "任务记录"],
            ] as const
          ).map(([tab, label]) => (
            <button
              aria-selected={assistantTab === tab}
              className={assistantTab === tab ? styles.assistantTabActive : styles.assistantTab}
              key={tab}
              onClick={() => setAssistantTab(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {assistantTab === "materials" ? (
        <section className={styles.authorization} data-task-configuration role="tabpanel">
          <div className={styles.sectionLabel}>
            <span>本次材料授权</span>
            <span>{readableSelectedMaterials.length} 项可读</span>
          </div>
          {files.map((material) => (
            <label
              className={`${styles.materialChoice} ${
                material.status === "cancelled" ? styles.materialDisabled : ""
              }`}
              key={material.id}
            >
              <input
                checked={selectedMaterialIds.includes(material.id)}
                disabled={material.status === "cancelled"}
                onChange={() => toggleMaterial(material.id)}
                type="checkbox"
              />
              <span>
                <strong>
                  {material.kind} · {statusText[material.status]}
                </strong>
                <small>{material.name}</small>
              </span>
            </label>
          ))}
          {materialBlocked ? (
            <p className={styles.materialWarning} role="alert">
              请至少勾选一项“可用”材料。未明确授权材料时，任务不会运行。
            </p>
          ) : null}
          <p className={styles.scopeNote}>
            当前只模拟用户上传材料；外部搜索和数据库均未接入。
          </p>
        </section>
        ) : null}

        {assistantTab === "evidence" ? (
        <section className={styles.evidenceSection}>
          <div className={styles.sectionLabel}>
            <span>引用与证据卡</span>
            <span>仅上传来源</span>
          </div>
          {evidenceItems.map((item) => (
            <article
              className={`${styles.evidenceCard} ${
                item.level === "unverified" ? styles.evidenceDanger : ""
              } ${activeEvidenceId === item.id ? styles.evidenceHighlighted : ""}`}
              data-evidence-id={item.id}
              key={item.id}
              onClick={() => focusClaim(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  focusClaim(item.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className={styles.evidenceHeader}>
                <span className={styles[`support_${item.level}`]}>{item.label}</span>
                <small>{item.id.replace("evidence-", "证据 ")}</small>
              </div>
              <strong className={styles.claimText}>{item.claim}</strong>
              <blockquote>“{item.quote}”</blockquote>
              <dl>
                <div>
                  <dt>文件</dt>
                  <dd>{item.source}</dd>
                </div>
                <div>
                  <dt>页码</dt>
                  <dd>{item.page}</dd>
                </div>
                <div>
                  <dt>段落</dt>
                  <dd>{item.paragraph}</dd>
                </div>
              </dl>
              {item.warning ? (
                <p className={item.level === "unverified" ? styles.dangerNote : styles.evidenceNote}>
                  {item.warning}
                </p>
              ) : null}
            </article>
          ))}
        </section>
        ) : null}

        {assistantTab === "tasks" ? (
          <section className={styles.taskHistory} role="tabpanel">
            <div className={styles.sectionLabel}>
              <span>最近任务记录</span>
              <span>Mock</span>
            </div>
            <article>
              <strong>{selectedSkill.title}</strong>
              <span>{taskLabels[visibleTaskStatus]}</span>
              <small>{displayedTaskMessage}</small>
            </article>
            <article>
              <strong>引用与证据检查</strong>
              <span>任务成功</span>
              <small>生成检查报告；2 条论断仍为“无法确认” · Mock</small>
            </article>
            <article>
              <strong>通用修改</strong>
              <span>任务已取消</span>
              <small>用户取消后没有创建新版本 · Mock</small>
            </article>
          </section>
        ) : null}
        </div>

        <div className={styles.taskDock}>
        <section
          className={`${styles.taskCard} ${styles[`task_${taskTone[visibleTaskStatus]}`]}`}
          aria-live="polite"
        >
          <div>
            <span className={styles.taskPulse} />
            <span>
              <strong>任务状态 · {taskLabels[visibleTaskStatus]}</strong>
              <small>{displayedTaskMessage}</small>
            </span>
          </div>
          {taskFailed ? (
            <div className={styles.fallbackPrompt} role="alert">
              <strong>主模型失败，是否使用备用模型？</strong>
              <span>只有你明确确认后，系统才会切换到 DeepSeek 备用模型。</span>
              <button onClick={retryWithFallback} type="button">
                确认使用 DeepSeek 重试
              </button>
            </div>
          ) : (
            <button
              disabled={!selectedSkillAvailability.enabled || canCancel}
              onClick={runTask}
              type="button"
            >
              {selectedSkillAvailability.enabled
                ? primaryLabel
                : selectedSkillAvailability.reason}
            </button>
          )}
          <div className={styles.taskActions}>
            {canCancel ? (
              <button onClick={cancelTask} type="button">
                取消任务
              </button>
            ) : (
              <button onClick={simulateFailure} type="button">
                模拟主模型失败
              </button>
            )}
          </div>
        </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorPage}>
      <header className={styles.topbar}>
        <div className={styles.projectIdentity}>
          <Link className={styles.brand} href="/projects" aria-label="返回项目列表">
            研
          </Link>
          <div>
            <p>
              <Link href="/projects">我的项目</Link>
              <span>/</span>
              <Link href={`/projects/${projectId}`}>数字平台中的知识协作机制研究</Link>
              <span>/</span>
              <strong>{selectedSection.title}</strong>
            </p>
            <small>
              {selectedSection.status} · {selectedSection.words.toLocaleString()} 字 ·{" "}
              {versions[0]?.label ?? "v1"} 当前版本
            </small>
          </div>
        </div>

        <div className={styles.topActions}>
          <span className={styles.saveStatus}>
            {unsavedChanges ? "有未保存修改" : "修改已保存"}
          </span>
          <button
            className={styles.secondaryButton}
            onClick={async () => {
              try {
                const content =
                  sectionRefs.current[selectedSectionId]?.innerText ?? "";
                await saveCurrentSection(content);
                setNotice(
                  dataSource === "d1"
                    ? "已追加一个新的 D1 章节版本，旧版本未覆盖。"
                    : "当前正文修改已标记保存 · Mock",
                );
              } catch {
                setNotice("保存失败，请查看基础数据状态提示。");
              }
            }}
            type="button"
          >
            保存修改
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            版本历史
          </button>
          <Link className={styles.exportButton} href={`/projects/${projectId}/export`}>
            DOCX 检查
          </Link>
        </div>
      </header>

      <div className={styles.mockBanner}>
        <span>
          {dataSource === "d1"
            ? "M3 基础持久化 · D1"
            : persistenceStatus === "loading"
              ? "正在读取 M3 基础数据"
              : "演示模式 · Mock"}
        </span>
        <p>
          {dataSource === "d1"
            ? "项目、诊断、提纲与章节版本使用真实基础数据；AI、材料解析、证据与 DOCX 仍为 Mock。"
            : persistenceError ||
              "所有任务、模型结果、材料解析、证据与版本均为内存演示，不会调用真实服务。"}
        </p>
      </div>

      {diagnosisStatus !== "confirmed" ? (
        <aside className={styles.warningBar} aria-label="诊断卡未确认警告">
          <span className={styles.warningIcon}>!</span>
          <div>
            <strong>诊断卡尚未确认，正式章节写作已阻断</strong>
            <p>你仍可编辑现有草稿并运行检查，但不能运行“通用章节写作”。</p>
          </div>
          <Link href={`/projects/${projectId}/diagnosis?status=draft`}>去确认诊断卡</Link>
        </aside>
      ) : null}

      {notice ? (
        <div className={styles.noticeBar} role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} type="button" aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.mobileTools}>
        <details>
          <summary>打开论文目录</summary>
          <div className={styles.mobileDrawer}>
            {renderOutlinePanel()}
          </div>
        </details>
        <details>
          <summary>打开 AI 工作台</summary>
          <div className={styles.mobileDrawer}>
            {renderAssistantPanel()}
          </div>
        </details>
      </div>

      <main
        className={`${styles.workspace} ${leftHidden ? styles.workspaceWithoutLeft : ""} ${
          rightHidden ? styles.workspaceWithoutRight : ""
        } ${focusMode ? styles.workspaceFocus : ""}`}
        data-editor-workspace
      >
        <aside aria-hidden={leftHidden} className={styles.leftPanel}>
          {renderOutlinePanel()}
        </aside>

        <section
          className={styles.documentArea}
          aria-label="正文编辑区"
          data-document-scroll
          ref={documentScrollRef}
        >
          <div className={styles.documentToolbar}>
            <div className={styles.formatTools} aria-label="基础格式工具">
              <button type="button">正文</button>
              <button aria-label="加粗" type="button">
                B
              </button>
              <button aria-label="斜体" type="button">
                I
              </button>
              <button type="button">引用</button>
            </div>
            <div className={styles.versionRule}>
              <span>当前版本 · {versions[0]?.label ?? "v1"}</span>
              <small>生成、修改或恢复都会创建新版本，不覆盖原稿</small>
            </div>
            <div className={styles.panelControls} aria-label="编辑器布局">
              <button
                aria-pressed={leftHidden}
                onClick={() => {
                  setFocusMode(false);
                  setLeftCollapsed(!leftHidden);
                }}
                type="button"
              >
                {leftHidden ? "展开目录" : "折叠目录"}
              </button>
              <button
                aria-pressed={focusMode}
                onClick={() => setFocusMode((current) => !current)}
                type="button"
              >
                {focusMode ? "退出专注" : "专注写作"}
              </button>
              <button
                aria-pressed={rightHidden}
                onClick={() => {
                  setFocusMode(false);
                  setRightCollapsed(!rightHidden);
                }}
                type="button"
              >
                {rightHidden ? "展开 AI" : "折叠 AI"}
              </button>
            </div>
          </div>

          <div className={styles.paperStack}>
            {outline.map((section) => {
              const copy = sectionCopy[section.id] ?? sectionCopy.introduction;
              const isIntroduction = section.id === "introduction";
              return (
                <div className={styles.paperPageGroup} key={section.id}>
                  <article
                    className={`${styles.paper} ${
                      section.id === selectedSectionId ? styles.paperActive : ""
                    }`}
                    contentEditable
                    data-section-id={section.id}
                    onInput={() => setUnsavedChanges(true)}
                    ref={(node) => {
                      sectionRefs.current[section.id] = node;
                    }}
                    suppressContentEditableWarning
                  >
                    <div className={styles.paperMeta} contentEditable={false}>
                      <span>{section.index}</span>
                      <span>{copy.kicker}</span>
                    </div>
                    <h1>{section.title}</h1>
                    <p className={styles.lead}>{copy.lead}</p>
                    <p
                      className={
                        activeEvidenceId === "evidence-direct" && isIntroduction
                          ? styles.claimHighlighted
                          : ""
                      }
                      ref={(node) => {
                        if (isIntroduction) claimRefs.current["evidence-direct"] = node;
                      }}
                    >
                      {copy.paragraphs[0]}
                      {isIntroduction ? (
                        <button
                          className={styles.evidenceAnchor}
                          contentEditable={false}
                          onClick={() => focusEvidence("evidence-direct")}
                          type="button"
                        >
                          证据 01
                        </button>
                      ) : null}
                    </p>
                    <p
                      className={
                        activeEvidenceId === "evidence-indirect" && isIntroduction
                          ? styles.claimHighlighted
                          : ""
                      }
                      ref={(node) => {
                        if (isIntroduction) claimRefs.current["evidence-indirect"] = node;
                      }}
                    >
                      {copy.paragraphs[1]}
                      {isIntroduction ? (
                        <button
                          className={styles.evidenceAnchor}
                          contentEditable={false}
                          onClick={() => focusEvidence("evidence-indirect")}
                          type="button"
                        >
                          证据 02
                        </button>
                      ) : null}
                    </p>
                    <h2>{copy.subheading}</h2>
                    <p
                      className={
                        activeEvidenceId === "evidence-unverified" && isIntroduction
                          ? styles.claimHighlighted
                          : ""
                      }
                      ref={(node) => {
                        if (isIntroduction) claimRefs.current["evidence-unverified"] = node;
                      }}
                    >
                      本节写作边界由已确认诊断卡、用户明确授权材料和前文章节共同决定。任何无法确认
                      的判断都会保留为警告，不会伪装成可核验事实。
                      {isIntroduction ? (
                        <button
                          className={styles.evidenceAnchor}
                          contentEditable={false}
                          onClick={() => focusEvidence("evidence-unverified")}
                          type="button"
                        >
                          证据 03
                        </button>
                      ) : null}
                    </p>
                    <aside className={styles.paperNote} contentEditable={false}>
                      <strong>编辑提示 · Mock</strong>
                      <span>{copy.note}</span>
                    </aside>
                  </article>

                  <footer className={styles.documentFooter}>
                    <span>
                      第 {section.index.replace(/^0/, "")} / {outline.length} 章
                    </span>
                    <span>{section.words.toLocaleString()} 字</span>
                    <span>中文 · APA 7th</span>
                  </footer>
                </div>
              );
            })}
          </div>
        </section>

        <aside aria-hidden={rightHidden} className={styles.rightPanel}>
          {renderAssistantPanel()}
        </aside>
      </main>

      {historyOpen ? (
        <div className={styles.historyBackdrop} role="presentation">
          <section
            aria-label="版本历史与比较"
            aria-modal="true"
            className={styles.historyPanel}
            role="dialog"
          >
            <header className={styles.historyHeader}>
              <div>
                <p>VERSION CONTROL · MOCK</p>
                <h2>版本历史与比较</h2>
                <span>恢复旧版只会创建新版本，任何历史内容都不会被覆盖。</span>
              </div>
              <button
                aria-label="关闭版本历史"
                onClick={() => setHistoryOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className={styles.versionLayout}>
              <div className={styles.versionList}>
                {versions.map((version, index) => (
                  <article className={styles.versionItem} key={version.id}>
                    <div>
                      <span className={styles.versionLabel}>
                        {version.label}
                        {index === 0 ? " · 当前" : ""}
                      </span>
                      <small>{version.time}</small>
                    </div>
                    <strong>{version.source}</strong>
                    <p>{version.summary}</p>
                    <div className={styles.versionActions}>
                      <label>
                        <input
                          checked={compareIds.includes(version.id)}
                          onChange={() => chooseComparison(version.id)}
                          type="checkbox"
                        />
                        加入比较
                      </label>
                      <button onClick={() => handleRestore(version.id)} type="button">
                        恢复为新版本
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.comparison}>
                <div className={styles.sectionLabel}>
                  <span>两版比较</span>
                  <span>{compareVersions.length} / 2 已选</span>
                </div>
                {compareVersions.length === 2 ? (
                  <div className={styles.comparisonGrid}>
                    {compareVersions.map((version, index) => (
                      <article key={version.id}>
                        <span>{version.label}</span>
                        <strong>{index === 0 ? "较早版本" : "较新版本"}</strong>
                        <p>{contentForVersion(version.id, version.summary)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyComparison}>
                    请从左侧勾选两个版本。选择第三个时会自动保留最近选择的两个。
                  </div>
                )}
                <div className={styles.diffSummary}>
                  <strong>变化摘要 · Mock</strong>
                  <ul>
                    <li>研究对象由一般团队收窄为跨机构远程研究团队。</li>
                    <li>增加可追溯性、反馈可见性与知识重组三个分析维度。</li>
                    <li>未改变原始上传版本；引用仍需回到上传材料核验。</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
