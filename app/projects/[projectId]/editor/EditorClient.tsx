"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  generationModel,
  mockReviewIssues,
  reviewDimensions,
  reviewModes,
  reviewModelOptions,
  reviewWorkflowLabels,
  type ReviewConclusion,
  type ReviewDecision,
  type ReviewMode,
  type ReviewWorkflowStatus,
} from "@/app/lib/dual-model-review-mock";
import { DUAL_MODEL_REVIEW_MOCK_ENABLED } from "@/app/lib/dual-model-review-features";
import { MODEL_ORCHESTRATION_MOCK_ENABLED } from "@/app/lib/model-orchestration-features";
import { strictAssignment } from "@/app/lib/model-orchestration-mock";
import { productSkills } from "@/app/lib/m1-mock";
import {
  createActionProposal,
  createToolIntent,
  decideActionProposal,
  M5_CONVERSATION_SKILL_PROMPTS,
  summarizeConversation,
  type M5ActionProposal,
  type M5ConversationMessage,
  type M5ConversationSummary,
  type M5ToolIntent,
} from "@/app/lib/m5-conversation-agent";
import {
  type TaskStatus,
  useMockWorkspace,
} from "@/app/lib/MockWorkspaceContext";
import { PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED } from "@/app/lib/progressive-diagnosis-features";
import { V042_INCREMENTAL_MOCK_ENABLED } from "@/app/lib/v042-features";
import styles from "./Editor.module.css";

type EditorClientProps = {
  projectId: string;
};

type VisibleTaskStatus = TaskStatus | "queued";
type AssistantTab = "materials" | "evidence" | "review" | "tasks";
type WorkspaceMode = "conversation" | "skills";

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

const assistantTabOptions: Array<{ id: AssistantTab; label: string }> = [
  { id: "materials", label: "本次材料授权" },
  { id: "evidence", label: "引用证据" },
  ...(DUAL_MODEL_REVIEW_MOCK_ENABLED
    ? [{ id: "review" as const, label: "AI 复核" }]
    : []),
  { id: "tasks", label: "任务记录" },
];

function nextVersionLabel(
  versions: Array<{ label: string }>,
): string {
  const nextNumber =
    Math.max(
      0,
      ...versions.map((version) => {
        const match = version.label.match(/\d+/);
        return match ? Number(match[0]) : 0;
      }),
    ) + 1;
  return `v${nextNumber}`;
}

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
    appendMockVersion,
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("conversation");
  const [assistantTab, setAssistantTab] = useState<AssistantTab>("materials");
  const [conversationPromptId, setConversationPromptId] = useState<string | null>(null);
  const [conversationDraft, setConversationDraft] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    M5ConversationMessage[]
  >([
    {
      id: "message-agent-welcome",
      role: "AGENT",
      content: "告诉我你现在想推进什么。",
      createdAt: "2026-07-28T00:00:00.000Z",
    },
  ]);
  const [conversationSummary, setConversationSummary] =
    useState<M5ConversationSummary | null>(null);
  const [toolIntent, setToolIntent] = useState<M5ToolIntent | null>(null);
  const [actionProposal, setActionProposal] =
    useState<M5ActionProposal | null>(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("standard");
  const [reviewerId, setReviewerId] = useState("deepseek-reasoner");
  const [reviewWorkflow, setReviewWorkflow] =
    useState<ReviewWorkflowStatus>("idle");
  const [reviewConclusion, setReviewConclusion] =
    useState<ReviewConclusion | null>(null);
  const [reviewDecision, setReviewDecision] =
    useState<ReviewDecision>("pending");
  const [selectedReviewIssueIds, setSelectedReviewIssueIds] = useState<string[]>(
    () =>
      mockReviewIssues
        .filter((issue) => issue.severity !== "low")
        .map((issue) => issue.id),
  );
  const [generatedVersion, setGeneratedVersion] = useState<string | null>(null);
  const [revisionVersion, setRevisionVersion] = useState<string | null>(null);
  const [finalVerification, setFinalVerification] = useState("未执行");
  const [ignoreReason, setIgnoreReason] = useState("");
  const [reviewRun, setReviewRun] = useState(1);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentScrollRef = useRef<HTMLElement | null>(null);
  const outlineDrawerRef = useRef<HTMLDetailsElement | null>(null);
  const assistantDrawerRef = useRef<HTMLDetailsElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const claimRefs = useRef<Record<string, HTMLElement | null>>({});
  const initialSectionHandledRef = useRef(false);

  const selectedSkill = useMemo(
    () => productSkills.find((skill) => skill.id === selectedSkillId) ?? productSkills[2],
    [selectedSkillId],
  );
  const selectedSection =
    outline.find((section) => section.id === selectedSectionId) ??
    outline[1] ?? {
      id: selectedSectionId || "introduction",
      index: "--",
      title: "正在读取章节",
      status: "未开始" as const,
      words: 0,
    };
  const leftHidden = focusMode || leftCollapsed;
  const rightHidden = focusMode || rightCollapsed;
  const isReportOnly = selectedSkillId === "consistency" || selectedSkillId === "evidence";
  const createsVersion =
    selectedSkillId === "chapter-writing" || selectedSkillId === "revision";
  const dualReviewApplies =
    DUAL_MODEL_REVIEW_MOCK_ENABLED && createsVersion;
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
      if (
        PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED &&
        selectedSection?.id === "results"
      ) {
        return {
          enabled: false,
          reason: "结果章节需要真实数据、样本、分析方法和结果材料。",
        };
      }
      if (
        PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED &&
        selectedSection?.id === "method" &&
        diagnosisStatus !== "confirmed"
      ) {
        return {
          enabled: false,
          reason: "方法章节需要确认研究对象、数据来源、样本或语料和基本研究设计。",
        };
      }
      if (
        !PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED &&
        diagnosisStatus !== "confirmed"
      ) {
        return { enabled: false, reason: "需先确认诊断卡。" };
      }
      if (!selectedSection) {
        return { enabled: false, reason: "需先选择当前章节。" };
      }
      return readableSelectedMaterials.length > 0
        ? {
            enabled: true,
            reason:
              PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED &&
              diagnosisStatus !== "confirmed"
                ? "READY_WITH_WARNINGS：可先写候选内容，待确认项必须保留警告。"
                : "诊断、章节与材料条件已满足。",
          }
        : { enabled: false, reason: "需先授权至少一份解析成功的材料。" };
    }
    return selectedSection
      ? { enabled: true, reason: "当前章节已经选定。" }
      : { enabled: false, reason: "需先选择当前章节。" };
  };
  const selectedSkillAvailability = skillAvailability(selectedSkillId);
  const blocked =
    selectedSkillId === "chapter-writing" && !selectedSkillAvailability.enabled;
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
  const selectedReviewMode =
    reviewModes.find((mode) => mode.id === reviewMode) ?? reviewModes[1];
  const selectedReviewer =
    reviewModelOptions.find((model) => model.id === reviewerId) ??
    reviewModelOptions[0];
  const reviewBusy = [
    "generating",
    "reviewing",
    "revising",
    "verifying",
  ].includes(reviewWorkflow);
  const reviewTaskTone =
    reviewWorkflow === "completed"
      ? "success"
      : reviewWorkflow === "review_failed"
        ? "failed"
        : reviewWorkflow === "report_ready"
          ? "queued"
          : reviewBusy
            ? "running"
            : "idle";
  const reviewConclusionClass =
    reviewConclusion === "REVIEW_FAILED" || reviewConclusion === "BLOCKED"
      ? styles.reviewConclusionDanger
      : reviewConclusion === "REVISION_REQUIRED"
        ? styles.reviewConclusionWarning
        : styles.reviewConclusionPassed;
  const reviewDecisionLabel: Record<ReviewDecision, string> = {
    pending: "等待用户决定",
    accepted_original: "已接受原版本",
    selected_for_revision: `已选择 ${selectedReviewIssueIds.length} 条问题修订`,
    ignored: "已忽略问题并记录理由",
  };
  const selectedConversationPrompt =
    M5_CONVERSATION_SKILL_PROMPTS.find(
      (prompt) => prompt.uiSkillId === conversationPromptId,
    ) ??
    M5_CONVERSATION_SKILL_PROMPTS.find(
      (prompt) => prompt.uiSkillId === selectedSkillId,
    ) ??
    M5_CONVERSATION_SKILL_PROMPTS[0];

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
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
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
    if (dualReviewApplies) {
      runDualModelTask();
      return;
    }
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

  function completeIndependentReview() {
    setReviewConclusion("REVISION_REQUIRED");
    setReviewWorkflow("report_ready");
    setReviewDecision("pending");
    setAssistantTab("review");
    setNotice(
      "独立审阅报告已生成；正文未被修改，请由你决定是否采纳。· Mock",
    );
  }

  function runDualModelTask() {
    if (!selectedSkillAvailability.enabled || reviewBusy) return;
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    const versionLabel = nextVersionLabel(versions);
    setNotice("");
    setReviewConclusion(null);
    setReviewDecision("pending");
    setGeneratedVersion(null);
    setRevisionVersion(null);
    setFinalVerification("未执行");
    setIgnoreReason("");
    setReviewRun(1);
    setReviewWorkflow("generating");

    reviewTimerRef.current = setTimeout(() => {
      appendMockVersion({
        id: `dual-generated-${Date.now()}`,
        label: versionLabel,
        source: `${selectedSkill.title} · ${generationModel.model} · Mock`,
        summary:
          "双模型流程的生成版本；后续审阅只创建报告，不覆盖本版本。",
      });
      setGeneratedVersion(versionLabel);

      if (reviewMode === "none") {
        setReviewWorkflow("completed");
        setAssistantTab("tasks");
        setNotice(`快速模式已创建 ${versionLabel}，未执行 AI 复核。· Mock`);
        return;
      }

      setReviewWorkflow("reviewing");
      reviewTimerRef.current = setTimeout(completeIndependentReview, 900);
    }, 850);
  }

  function toggleReviewIssue(id: string) {
    setSelectedReviewIssueIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function acceptOriginalVersion() {
    setReviewDecision("accepted_original");
    setReviewWorkflow("completed");
    setFinalVerification("不适用：用户接受原生成版本");
    setNotice(
      `${generatedVersion ?? "生成版本"} 已保留；审阅意见未改写正文。· Mock`,
    );
  }

  function ignoreReviewIssues() {
    if (!ignoreReason.trim()) {
      setNotice("忽略审阅问题前，请填写理由。");
      return;
    }
    setReviewDecision("ignored");
    setReviewWorkflow("completed");
    setFinalVerification("未执行：用户忽略问题并已记录理由");
    setNotice("忽略理由已记录；原生成版本保留，未标记为审阅通过。· Mock");
  }

  function generateRevisionFromReview() {
    if (
      reviewMode !== "strict" ||
      selectedReviewIssueIds.length === 0 ||
      revisionVersion ||
      reviewBusy
    ) {
      return;
    }
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    const versionLabel = nextVersionLabel(versions);
    setReviewDecision("selected_for_revision");
    setReviewWorkflow("revising");
    setNotice("");

    reviewTimerRef.current = setTimeout(() => {
      appendMockVersion({
        id: `dual-revision-${Date.now()}`,
        label: versionLabel,
        source: `按审阅意见修订 · ${generationModel.model} · Mock`,
        summary: `只处理用户选中的 ${selectedReviewIssueIds.length} 条问题；原生成版本未覆盖。`,
      });
      setRevisionVersion(versionLabel);
      setReviewWorkflow("verifying");
      reviewTimerRef.current = setTimeout(() => {
        setReviewConclusion("PASSED_WITH_WARNINGS");
        setFinalVerification(
          `F${versionLabel.replace(/\D/g, "")} · PASSED_WITH_WARNINGS`,
        );
        setReviewWorkflow("completed");
        setNotice(
          `已创建 ${versionLabel} 并完成一次最终验证；流程不会继续自动循环。· Mock`,
        );
      }, 850);
    }, 850);
  }

  function rerunIndependentReview() {
    if (!generatedVersion || reviewBusy) return;
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    setReviewRun((current) => current + 1);
    setReviewConclusion(null);
    setReviewDecision("pending");
    setReviewWorkflow("reviewing");
    setFinalVerification("未执行");
    setNotice("");
    reviewTimerRef.current = setTimeout(completeIndependentReview, 900);
  }

  function simulateIndependentReviewFailure() {
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    setReviewConclusion("REVIEW_FAILED");
    setReviewWorkflow("review_failed");
    setReviewDecision("pending");
    setFinalVerification("未执行");
    setAssistantTab("review");
    setNotice(
      `审阅失败；${generatedVersion ?? "原生成版本"} 已保留，但不得标记为审阅通过。· Mock`,
    );
  }

  function cancelDualModelFlow() {
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    const generated = Boolean(generatedVersion);
    setReviewWorkflow(generated ? "review_failed" : "idle");
    setReviewConclusion(generated ? "REVIEW_FAILED" : null);
    setNotice(
      generated
        ? "已停止复核；原生成版本保留，当前不得标记为审阅通过。· Mock"
        : "已取消生成，没有创建新版本。· Mock",
    );
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

  function openSkillInConversation(skillId: string) {
    const prompt = M5_CONVERSATION_SKILL_PROMPTS.find(
      (item) => item.uiSkillId === skillId,
    );
    if (!prompt) return;
    setSelectedSkillId(skillId);
    setConversationPromptId(skillId);
    setConversationDraft(prompt.prompt);
    setToolIntent(null);
    setActionProposal(null);
    setWorkspaceMode("conversation");
  }

  function prepareConversationProposal() {
    const content = conversationDraft.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const userMessage: M5ConversationMessage = {
      id: `message-user-${now}`,
      role: "USER",
      content,
      createdAt: now,
    };
    const agentMessage: M5ConversationMessage = {
      id: `message-agent-${now}`,
      role: "AGENT",
      content: `我理解你希望使用“${selectedConversationPrompt.title}”。我已整理为 ToolIntent；请先核对操作范围，再决定是否确认。`,
      createdAt: now,
    };
    const nextMessages = [...conversationMessages, userMessage, agentMessage];
    const nextIntent = createToolIntent({
      conversationId: `conversation-${projectId}`,
      productSkill: selectedConversationPrompt.productSkill,
      operation: content,
      rationale: `根据用户本轮表达，建议交由“${selectedConversationPrompt.title}”处理。`,
      authorizedMaterialIds: readableSelectedMaterials.map((material) => material.id),
      now,
    });
    setSelectedSkillId(selectedConversationPrompt.uiSkillId);
    setConversationMessages(nextMessages);
    setConversationSummary(summarizeConversation(nextMessages, now));
    setToolIntent(nextIntent);
    setActionProposal(
      createActionProposal(nextIntent, `准备${selectedConversationPrompt.title}任务`),
    );
    setConversationDraft("");
  }

  function resetConversation() {
    setConversationMessages([
      {
        id: "message-agent-welcome",
        role: "AGENT",
        content: "告诉我你现在想推进什么。",
        createdAt: "2026-07-28T00:00:00.000Z",
      },
    ]);
    setConversationSummary(null);
    setToolIntent(null);
    setActionProposal(null);
    setConversationPromptId(null);
    setConversationDraft("");
  }

  function renderConversationPanel() {
    return (
      <section className={styles.conversationAgent} aria-label="Conversation Agent">
        <div className={styles.conversationHeader}>
          <strong>Conversation Agent</strong>
          <button onClick={resetConversation} type="button">
            新会话
          </button>
        </div>

        <div className={styles.conversationMessages} aria-live="polite">
          {conversationMessages.map((message) => (
            <article
              className={
                message.role === "USER"
                  ? styles.conversationMessageUser
                  : styles.conversationMessageAgent
              }
              key={message.id}
            >
              <span>{message.role === "USER" ? "你" : "AI"}</span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <div className={styles.conversationComposer}>
          <label htmlFor="conversation-agent-input">告诉 AI 你想推进什么</label>
          <textarea
            id="conversation-agent-input"
            onChange={(event) => setConversationDraft(event.target.value)}
            placeholder="直接描述你希望 AI 帮你推进的任务"
            rows={3}
            value={conversationDraft}
          />
          <button
            disabled={!conversationDraft.trim()}
            onClick={prepareConversationProposal}
            type="button"
          >
            整理为操作提案
          </button>
        </div>

        {conversationSummary ? (
          <details className={styles.conversationSummary}>
            <summary>长期会话摘要</summary>
            <p>{conversationSummary.text}</p>
            <small>系统派生摘要，尚未作为用户确认事实。</small>
          </details>
        ) : null}

        {toolIntent && actionProposal ? (
          <article className={styles.actionProposal} data-action-proposal>
            <div className={styles.sectionLabel}>
              <span>Action Proposal</span>
              <span>{actionProposal.status}</span>
            </div>
            <strong>{actionProposal.title}</strong>
            <dl>
              <div>
                <dt>ToolIntent</dt>
                <dd>{toolIntent.productSkill}</dd>
              </div>
              <div>
                <dt>拟执行</dt>
                <dd>{toolIntent.operation}</dd>
              </div>
              <div>
                <dt>允许材料</dt>
                <dd>{toolIntent.authorizedMaterialIds.length} 份</dd>
              </div>
            </dl>
            <p>{actionProposal.effect}</p>
            {actionProposal.warnings.map((warning) => (
              <small className={styles.proposalWarning} key={warning}>
                {warning}
              </small>
            ))}
            {actionProposal.status === "AWAITING_USER_CONFIRMATION" ? (
              <div className={styles.proposalActions}>
                <button
                  onClick={() => {
                    setActionProposal(
                      decideActionProposal(actionProposal, "CONFIRM", new Date().toISOString()),
                    );
                    setNotice("操作提案已确认；等待后续任务执行器，本批次未调用真实模型。");
                  }}
                  type="button"
                >
                  确认提案
                </button>
                <button
                  onClick={() =>
                    setActionProposal(
                      decideActionProposal(actionProposal, "REJECT", new Date().toISOString()),
                    )
                  }
                  type="button"
                >
                  暂不执行
                </button>
              </div>
            ) : (
              <p className={styles.proposalDecision}>
                {actionProposal.status === "CONFIRMED"
                  ? "已由用户确认；尚未执行真实任务。"
                  : "用户已拒绝，本提案不会执行。"}
              </p>
            )}
          </article>
        ) : null}
      </section>
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

        <div className={styles.workspaceModeTabs} role="tablist" aria-label="AI 工作台模式">
          <button
            aria-selected={workspaceMode === "conversation"}
            className={workspaceMode === "conversation" ? styles.workspaceModeActive : ""}
            onClick={() => setWorkspaceMode("conversation")}
            role="tab"
            type="button"
          >
            对话 Agent
          </button>
          <button
            aria-selected={workspaceMode === "skills"}
            className={workspaceMode === "skills" ? styles.workspaceModeActive : ""}
            onClick={() => setWorkspaceMode("skills")}
            role="tab"
            type="button"
          >
            Skill 任务
          </button>
        </div>

        {workspaceMode === "skills" ? (
        <>

        <div className={styles.assistantIntro}>
          <strong>你想让 AI 完成什么？</strong>
          <span>AI 将读取当前项目上下文和你本次授权的材料。</span>
        </div>

        {V042_INCREMENTAL_MOCK_ENABLED ? (
          <details className={styles.extensionEntry} data-v042-extension-entry>
            <summary>
              <span>
                <strong>研究扩展</strong>
                <small>独立研究工作区 · 科研图件进入 M8.1</small>
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
                          openSkillInConversation(skill.id);
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
              {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED
                ? "查看任务缺口并继续梳理 →"
                : "返回诊断卡确认 →"}
            </Link>
          ) : null}
        </section>

        <div className={styles.assistantTabs} role="tablist" aria-label="AI 工作台上下文">
          {assistantTabOptions.map(({ id: tab, label }) => (
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
          {DUAL_MODEL_REVIEW_MOCK_ENABLED ? (
            <div className={styles.reviewConfiguration} data-review-configuration>
              <div className={styles.sectionLabel}>
                <span>AI 复核</span>
                <span>双模型 · Mock</span>
              </div>
              <div
                className={styles.reviewModeGrid}
                role="radiogroup"
                aria-label="AI 复核模式"
              >
                {reviewModes.map((mode) => (
                  <button
                    aria-checked={reviewMode === mode.id}
                    className={
                      reviewMode === mode.id
                        ? styles.reviewModeActive
                        : styles.reviewModeButton
                    }
                    key={mode.id}
                    onClick={() => {
                      if (reviewBusy) return;
                      setReviewMode(mode.id);
                      setReviewWorkflow("idle");
                      setReviewConclusion(null);
                      setGeneratedVersion(null);
                      setRevisionVersion(null);
                      setReviewDecision("pending");
                      setFinalVerification("未执行");
                    }}
                    role="radio"
                    type="button"
                  >
                    <strong>{mode.label}</strong>
                    <small>{mode.productMode}</small>
                  </button>
                ))}
              </div>
              <p className={styles.reviewModeDescription}>
                {selectedReviewMode.description}
              </p>

              <div className={styles.modelPlan}>
                <article>
                  <span>生成模型</span>
                  <strong>
                    {generationModel.provider} · {generationModel.model}
                  </strong>
                  <small>
                    {generationModel.skill} · {generationModel.skillVersion}
                  </small>
                </article>
                <article>
                  <span>审阅模型</span>
                  <strong>
                    {reviewMode === "none"
                      ? "不执行"
                      : `${selectedReviewer.provider} · ${selectedReviewer.model}`}
                  </strong>
                  <small>
                    {reviewMode === "none"
                      ? "快速模式只生成"
                      : `${selectedReviewer.skill} · ${selectedReviewer.skillVersion}`}
                  </small>
                </article>
                {MODEL_ORCHESTRATION_MOCK_ENABLED &&
                reviewMode === "strict" ? (
                  <article>
                    <span>验证模型</span>
                    <strong>
                      {strictAssignment.provider} · {strictAssignment.model}
                    </strong>
                    <small>
                      {strictAssignment.skill} · {strictAssignment.skill_version}
                    </small>
                  </article>
                ) : null}
              </div>

              <dl className={styles.executionEstimate}>
                <div>
                  <dt>预计调用</dt>
                  <dd>{selectedReviewMode.calls}</dd>
                </div>
                <div>
                  <dt>预计耗时</dt>
                  <dd>{selectedReviewMode.duration}</dd>
                </div>
                <div>
                  <dt>允许读取</dt>
                  <dd>{readableSelectedMaterials.length} 份可读材料</dd>
                </div>
              </dl>

              <div className={styles.reviewScope}>
                <strong>审阅上下文</strong>
                <span>✓ 用户原始要求</span>
                <span>✓ 已确认诊断卡</span>
                <span>✓ 本次授权材料</span>
                <span>✓ 生成版本</span>
                <span>✓ 已建立证据绑定</span>
              </div>
              <p className={styles.reviewBoundary}>
                审阅只创建报告，不直接修改正文；不得只凭模型自身知识判断文献是否支持论断。
              </p>
              {MODEL_ORCHESTRATION_MOCK_ENABLED ? (
                <div className={styles.orchestrationDisclosure}>
                  <div>
                    <strong>
                      {reviewMode === "strict"
                        ? "严格模式 · 最多 3 个模型"
                        : reviewMode === "standard"
                          ? "标准模式 · 2 个模型"
                          : "快速模式 · 1 个模型"}
                    </strong>
                    <span>
                      平台额度 / 用户 Key、数据处理方、超时与降级方案将在执行前再次披露。
                    </span>
                  </div>
                  <Link href="/settings/models">配置模型与 API →</Link>
                </div>
              ) : null}
            </div>
          ) : null}
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

        {assistantTab === "review" && DUAL_MODEL_REVIEW_MOCK_ENABLED ? (
          <section className={styles.reviewPanel} role="tabpanel">
            <div className={styles.sectionLabel}>
              <span>双模型独立审阅</span>
              <span>{reviewWorkflowLabels[reviewWorkflow]}</span>
            </div>

            {!generatedVersion && reviewWorkflow === "idle" ? (
              <div className={styles.reviewEmpty}>
                <strong>尚未生成可审阅版本</strong>
                <p>
                  请先在“本次材料授权”中选择复核模式并运行章节生成或通用修改任务。
                </p>
              </div>
            ) : null}

            {reviewWorkflow === "generating" ? (
              <div className={styles.reviewProgress}>
                <span className={styles.reviewSpinner} />
                <div>
                  <strong>生成中</strong>
                  <p>
                    {generationModel.provider} · {generationModel.model} 正在创建新版本。
                  </p>
                </div>
              </div>
            ) : null}

            {reviewWorkflow === "reviewing" ? (
              <div className={styles.reviewProgress}>
                <span className={styles.reviewSpinner} />
                <div>
                  <strong>独立审阅中</strong>
                  <p>
                    {selectedReviewer.provider} · {selectedReviewer.model} 正在读取要求、诊断卡、授权材料、生成版本和证据绑定。
                  </p>
                </div>
              </div>
            ) : null}

            {generatedVersion ? (
              <div className={styles.reviewResultChain}>
                <article>
                  <span>生成版本</span>
                  <strong>{generatedVersion}</strong>
                  <small>
                    {generationModel.provider} · {generationModel.model} ·{" "}
                    {generationModel.skillVersion}
                  </small>
                </article>
                <article>
                  <span>审阅报告</span>
                  <strong>
                    {reviewMode === "none"
                      ? "未执行"
                      : `R${generatedVersion.replace(/\D/g, "")} · 第 ${reviewRun} 次`}
                  </strong>
                  <small>
                    {reviewMode === "none"
                      ? "快速模式"
                      : `${selectedReviewer.provider} · ${selectedReviewer.model} · ${selectedReviewer.skillVersion}`}
                  </small>
                </article>
                <article>
                  <span>用户采纳状态</span>
                  <strong>{reviewDecisionLabel[reviewDecision]}</strong>
                  <small>所有处理决定均保留在任务记录中 · Mock</small>
                </article>
                <article>
                  <span>修订版本</span>
                  <strong>{revisionVersion ?? "未创建"}</strong>
                  <small>修改只创建新版本，不覆盖生成版本</small>
                </article>
                <article>
                  <span>最终验证</span>
                  <strong>{finalVerification}</strong>
                  <small>最多执行一次，不进入自动循环</small>
                </article>
              </div>
            ) : null}

            {generatedVersion && reviewMode === "none" ? (
              <div className={styles.reviewQuickResult}>
                <strong>快速模式已完成</strong>
                <p>
                  已创建 {generatedVersion}，没有调用审阅模型，也没有审阅通过结论。
                </p>
              </div>
            ) : null}

            {reviewWorkflow === "review_failed" ? (
              <div className={styles.reviewFailure} role="alert">
                <span>REVIEW_FAILED</span>
                <strong>审阅任务失败，原生成结果已保留</strong>
                <p>
                  {generatedVersion ?? "生成版本"} 不会丢失，但不得标记为审阅通过。你可以更换审阅模型后重新审阅。
                </p>
              </div>
            ) : null}

            {reviewConclusion && reviewConclusion !== "REVIEW_FAILED" ? (
              <>
                <div
                  className={`${styles.reviewConclusion} ${reviewConclusionClass}`}
                >
                  <span>统一审阅结论</span>
                  <strong>{reviewConclusion}</strong>
                  <small>
                    {mockReviewIssues.length} 个问题 · 2 高 · 2 中 · 1 低
                  </small>
                </div>

                <div className={styles.reviewContextAudit}>
                  <strong>本次审阅实际读取</strong>
                  <span>用户原始要求</span>
                  <span>已确认诊断卡</span>
                  <span>{readableSelectedMaterials.length} 份授权可读材料</span>
                  <span>{generatedVersion} 生成版本</span>
                  <span>3 条现有证据绑定</span>
                </div>

                <details className={styles.reviewDimensions}>
                  <summary>查看 11 项审阅维度</summary>
                  <div>
                    {reviewDimensions.map((dimension) => (
                      <span key={dimension}>✓ {dimension}</span>
                    ))}
                  </div>
                </details>

                <p className={styles.reviewEvidenceRule}>
                  证据判断只依据本次授权材料和已建立绑定；审阅模型自身知识不能替代原文、页码或段落。
                </p>

                <div className={styles.reviewIssueList}>
                  {mockReviewIssues.map((issue) => {
                    const selected = selectedReviewIssueIds.includes(issue.id);
                    return (
                      <label
                        className={
                          selected
                            ? styles.reviewIssueSelected
                            : styles.reviewIssue
                        }
                        key={issue.id}
                      >
                        <input
                          checked={selected}
                          disabled={
                            reviewDecision !== "pending" ||
                            Boolean(revisionVersion)
                          }
                          onChange={() => toggleReviewIssue(issue.id)}
                          type="checkbox"
                        />
                        <span className={styles[`severity_${issue.severity}`]}>
                          {issue.severity === "high"
                            ? "高"
                            : issue.severity === "medium"
                              ? "中"
                              : "低"}
                        </span>
                        <span>
                          <small>{issue.category}</small>
                          <strong>{issue.title}</strong>
                          <p>{issue.detail}</p>
                          <em>建议：{issue.suggestion}</em>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className={styles.reviewActions}>
                  <button
                    disabled={reviewBusy || reviewDecision !== "pending"}
                    onClick={acceptOriginalVersion}
                    type="button"
                  >
                    接受原版本
                  </button>
                  <button
                    disabled={
                      reviewMode !== "strict" ||
                      reviewBusy ||
                      reviewDecision !== "pending" ||
                      selectedReviewIssueIds.length === 0 ||
                      Boolean(revisionVersion)
                    }
                    onClick={generateRevisionFromReview}
                    type="button"
                  >
                    按所选 {selectedReviewIssueIds.length} 条意见生成新版本
                  </button>
                  {reviewMode !== "strict" ? (
                    <p>标准复核只生成报告；切换严格复核后才允许一次修订和最终验证。</p>
                  ) : null}
                </div>

                <div className={styles.ignoreReview}>
                  <label htmlFor="review-ignore-reason">忽略问题的理由</label>
                  <textarea
                    disabled={reviewBusy || reviewDecision !== "pending"}
                    id="review-ignore-reason"
                    onChange={(event) => setIgnoreReason(event.target.value)}
                    placeholder="例如：该判断将在导师审阅后另行处理。"
                    value={ignoreReason}
                  />
                  <button
                    disabled={reviewBusy || reviewDecision !== "pending"}
                    onClick={ignoreReviewIssues}
                    type="button"
                  >
                    忽略问题并记录理由
                  </button>
                </div>
              </>
            ) : null}

            {generatedVersion && reviewMode !== "none" ? (
              <div className={styles.reviewerControls}>
                <label htmlFor="review-model">审阅模型</label>
                <select
                  disabled={reviewBusy}
                  id="review-model"
                  onChange={(event) => setReviewerId(event.target.value)}
                  value={reviewerId}
                >
                  {reviewModelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.provider} · {model.model}
                    </option>
                  ))}
                </select>
                <small>{selectedReviewer.note}</small>
                <div>
                  <button
                    disabled={reviewBusy}
                    onClick={rerunIndependentReview}
                    type="button"
                  >
                    更换后重新审阅
                  </button>
                  <button
                    disabled={reviewBusy}
                    onClick={simulateIndependentReviewFailure}
                    type="button"
                  >
                    模拟审阅失败
                  </button>
                </div>
              </div>
            ) : null}
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
            {DUAL_MODEL_REVIEW_MOCK_ENABLED && generatedVersion ? (
              <article>
                <strong>双模型生成与独立审阅</strong>
                <span>{reviewWorkflowLabels[reviewWorkflow]}</span>
                <small>
                  {generatedVersion} →{" "}
                  {reviewMode === "none"
                    ? "未复核"
                    : `R${generatedVersion.replace(/\D/g, "")} · ${reviewConclusion ?? "处理中"}`}
                  {revisionVersion ? ` → ${revisionVersion} → ${finalVerification}` : ""}
                </small>
              </article>
            ) : null}
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
        </>
        ) : renderConversationPanel()}
        </div>

        {workspaceMode === "skills" ? (
        <div className={styles.taskDock}>
        {dualReviewApplies ? (
        <section
          className={`${styles.taskCard} ${styles[`task_${reviewTaskTone}`]}`}
          aria-live="polite"
          data-dual-model-task
        >
          <div>
            <span className={styles.taskPulse} />
            <span>
              <strong>
                双模型任务 · {reviewWorkflowLabels[reviewWorkflow]}
              </strong>
              <small>
                {reviewWorkflow === "idle"
                  ? `${selectedReviewMode.productMode} · ${selectedReviewMode.calls} · ${selectedReviewMode.duration}`
                  : reviewWorkflow === "generating"
                    ? `${generationModel.provider} · ${generationModel.model} 正在生成新版本 · Mock`
                    : reviewWorkflow === "reviewing"
                      ? `${selectedReviewer.provider} · ${selectedReviewer.model} 正在独立审阅 · Mock`
                      : reviewWorkflow === "report_ready"
                        ? `${reviewConclusion} · 正文未修改，等待用户决定`
                        : reviewWorkflow === "revising"
                          ? `只处理已选择的 ${selectedReviewIssueIds.length} 条问题 · Mock`
                          : reviewWorkflow === "verifying"
                            ? "正在执行唯一一次最终验证 · Mock"
                            : reviewWorkflow === "review_failed"
                              ? `${generatedVersion ?? "原生成版本"} 已保留，不得标记审阅通过`
                              : `${revisionVersion ?? generatedVersion ?? "版本"} 已保留 · ${finalVerification}`}
              </small>
            </span>
          </div>
          <button
            disabled={!selectedSkillAvailability.enabled || reviewBusy}
            onClick={() => {
              if (reviewWorkflow === "report_ready") {
                setAssistantTab("review");
                return;
              }
              runDualModelTask();
            }}
            type="button"
          >
            {!selectedSkillAvailability.enabled
              ? selectedSkillAvailability.reason
              : reviewBusy
                ? reviewWorkflowLabels[reviewWorkflow]
                : reviewWorkflow === "report_ready"
                  ? "查看审阅报告"
                  : reviewWorkflow === "completed"
                    ? "重新运行双模型流程"
                    : reviewWorkflow === "review_failed"
                      ? "重新生成完整流程"
                      : `${primaryLabel} · ${selectedReviewMode.label}`}
          </button>
          <div className={styles.taskActions}>
            {reviewBusy ? (
              <button onClick={cancelDualModelFlow} type="button">
                停止当前 Mock 流程
              </button>
            ) : generatedVersion && reviewMode !== "none" ? (
              <button onClick={() => setAssistantTab("review")} type="button">
                查看复核详情
              </button>
            ) : (
              <button onClick={() => setAssistantTab("materials")} type="button">
                检查模型与材料配置
              </button>
            )}
          </div>
        </section>
        ) : (
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
        )}
        </div>
        ) : null}
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
            <strong>
              {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED
                ? "诊断卡仍在梳理中，系统会按当前任务判断是否可继续"
                : "诊断卡尚未确认，正式章节写作已阻断"}
            </strong>
            <p>
              {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED
                ? "文献探索、题目收窄和候选问题可以先开展；方法、结果和正式引用仍需对应确认或材料。"
                : "你仍可编辑现有草稿并运行检查，但不能运行“通用章节写作”。"}
            </p>
          </div>
          <Link href={`/projects/${projectId}/diagnosis?status=draft`}>
            {PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED ? "进入 AI 引导梳理" : "去确认诊断卡"}
          </Link>
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
        <details
          onToggle={(event) => {
            if (event.currentTarget.open) setFocusMode(false);
          }}
          ref={outlineDrawerRef}
        >
          <summary>
            <span className={styles.compactOpenLabel}>打开论文目录</span>
            <span className={styles.compactCloseLabel}>关闭论文目录</span>
          </summary>
          <div className={styles.mobileDrawer}>
            {renderOutlinePanel()}
          </div>
        </details>
        <details
          onToggle={(event) => {
            if (event.currentTarget.open) setFocusMode(false);
          }}
          ref={assistantDrawerRef}
        >
          <summary>
            <span className={styles.compactOpenLabel}>打开 AI 工作台</span>
            <span className={styles.compactCloseLabel}>关闭 AI 工作台</span>
          </summary>
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
                className={styles.desktopSidebarAction}
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
                onClick={() =>
                  setFocusMode((current) => {
                    const next = !current;
                    if (next) {
                      if (outlineDrawerRef.current) outlineDrawerRef.current.open = false;
                      if (assistantDrawerRef.current) assistantDrawerRef.current.open = false;
                    }
                    return next;
                  })
                }
                type="button"
              >
                {focusMode ? "退出专注" : "专注写作"}
              </button>
              <button
                className={styles.desktopSidebarAction}
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
