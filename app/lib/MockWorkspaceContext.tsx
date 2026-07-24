"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type FileQueueStatus =
  | "queued"
  | "parsing"
  | "success"
  | "failed"
  | "cancelled";

export type FileQueueItem = {
  id: string;
  name: string;
  kind: string;
  size: string;
  status: FileQueueStatus;
  detail: string;
};

export type DiagnosisDraft = {
  title: string;
  paperType: string;
  language: string;
  researchObject: string;
  researchQuestion: string;
  method: string;
  requirements: string;
};

export type OutlineSection = {
  id: string;
  index: string;
  title: string;
  status: "未开始" | "编辑中" | "待检查" | "已确认" | "缺少材料";
  words: number;
};

export type TaskStatus = "idle" | "queued" | "running" | "success" | "failed" | "cancelled";

export type VersionItem = {
  id: string;
  label: string;
  source: string;
  time: string;
  summary: string;
};

type MockWorkspaceValue = {
  files: FileQueueItem[];
  setFileStatus: (id: string, status: FileQueueStatus) => void;
  retryFile: (id: string) => void;
  draftSaved: boolean;
  saveCreationDraft: () => void;
  diagnosis: DiagnosisDraft;
  diagnosisStatus: "draft" | "confirmed" | "updated";
  updateDiagnosis: (field: keyof DiagnosisDraft, value: string) => void;
  confirmDiagnosis: () => void;
  reopenDiagnosis: () => void;
  outline: OutlineSection[];
  outlineConfirmed: boolean;
  updateOutlineTitle: (id: string, title: string) => void;
  moveOutline: (id: string, direction: -1 | 1) => void;
  confirmOutline: () => void;
  selectedSectionId: string;
  setSelectedSectionId: (id: string) => void;
  selectedSkillId: string;
  setSelectedSkillId: (id: string) => void;
  selectedMaterialIds: string[];
  toggleMaterial: (id: string) => void;
  taskStatus: TaskStatus;
  taskMessage: string;
  runMockTask: () => void;
  cancelMockTask: () => void;
  failMockTask: () => void;
  versions: VersionItem[];
  restoreVersion: (id: string) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (value: boolean) => void;
};

const initialFiles: FileQueueItem[] = [
  {
    id: "requirements",
    name: "投稿规范与章节要求.docx",
    kind: "论文要求",
    size: "248 KB",
    status: "success",
    detail: "已解析 12 条硬性要求 · Mock",
  },
  {
    id: "literature",
    name: "platform-collaboration-review.pdf",
    kind: "研究文献",
    size: "2.4 MB",
    status: "parsing",
    detail: "正在识别章节与页码 · Mock",
  },
  {
    id: "data",
    name: "interview-coding.csv",
    kind: "研究数据",
    size: "86 KB",
    status: "failed",
    detail: "字段标题缺失，可修正后重试 · Mock",
  },
  {
    id: "cancelled",
    name: "old-outline.txt",
    kind: "历史材料",
    size: "18 KB",
    status: "cancelled",
    detail: "用户已取消 · Mock",
  },
];

const initialDiagnosis: DiagnosisDraft = {
  title: "数字平台中的知识协作机制研究",
  paperType: "期刊论文",
  language: "中文",
  researchObject: "跨机构远程研究团队",
  researchQuestion: "远程研究团队如何通过平台实践形成共同理解？",
  method: "",
  requirements: "12,000 字；APA 7th；需说明材料与研究边界。",
};

const initialOutline: OutlineSection[] = [
  { id: "abstract", index: "01", title: "摘要", status: "待检查", words: 286 },
  { id: "introduction", index: "02", title: "引言", status: "编辑中", words: 1248 },
  { id: "literature", index: "03", title: "文献综述", status: "待检查", words: 2180 },
  { id: "method", index: "04", title: "研究方法", status: "缺少材料", words: 1620 },
  { id: "results", index: "05", title: "结果与讨论", status: "缺少材料", words: 640 },
  { id: "conclusion", index: "06", title: "结论", status: "未开始", words: 0 },
];

const initialVersions: VersionItem[] = [
  {
    id: "v3",
    label: "v3",
    source: "人工保存",
    time: "今天 20:36",
    summary: "收窄研究对象，并明确平台机制的三个分析维度。",
  },
  {
    id: "v2",
    label: "v2",
    source: "通用修改 · Mock",
    time: "今天 19:48",
    summary: "改善段落衔接，保留原始论证范围。",
  },
  {
    id: "v1",
    label: "v1 原始版本",
    source: "用户输入",
    time: "今天 18:20",
    summary: "首次创建的章节原稿，永不覆盖。",
  },
];

const MockWorkspaceContext = createContext<MockWorkspaceValue | null>(null);

export function MockWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState(initialFiles);
  const [draftSaved, setDraftSaved] = useState(false);
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [diagnosisStatus, setDiagnosisStatus] = useState<"draft" | "confirmed" | "updated">(
    "draft",
  );
  const [outline, setOutline] = useState(initialOutline);
  const [outlineConfirmed, setOutlineConfirmed] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState("introduction");
  const [selectedSkillId, setSelectedSkillId] = useState("chapter-writing");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState(["requirements", "literature"]);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [taskMessage, setTaskMessage] = useState("尚未创建任务");
  const [versions, setVersions] = useState(initialVersions);
  const [unsavedChanges, setUnsavedChanges] = useState(true);
  const taskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFileStatus = useCallback((id: string, status: FileQueueStatus) => {
    setFiles((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              detail:
                status === "success"
                  ? "解析成功，内容可用于本项目 · Mock"
                  : status === "cancelled"
                    ? "用户已取消 · Mock"
                    : status === "parsing"
                      ? "正在解析材料 · Mock"
                      : item.detail,
            }
          : item,
      ),
    );
  }, []);

  const retryFile = useCallback(
    (id: string) => {
      setFileStatus(id, "parsing");
      setTimeout(() => setFileStatus(id, "success"), 650);
    },
    [setFileStatus],
  );

  const updateDiagnosis = useCallback((field: keyof DiagnosisDraft, value: string) => {
    setDiagnosis((current) => ({ ...current, [field]: value }));
    setDiagnosisStatus((current) => (current === "confirmed" ? "updated" : current));
  }, []);

  const moveOutline = useCallback((id: string, direction: -1 | 1) => {
    setOutline((items) => {
      const index = items.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, itemIndex) => ({
        ...item,
        index: String(itemIndex + 1).padStart(2, "0"),
      }));
    });
    setOutlineConfirmed(false);
  }, []);

  const toggleMaterial = useCallback((id: string) => {
    setSelectedMaterialIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }, []);

  const runMockTask = useCallback(() => {
    if (taskTimerRef.current) clearTimeout(taskTimerRef.current);
    setTaskStatus("running");
    setTaskMessage("ChatGPT 主模型正在生成新的章节版本 · Mock");
    taskTimerRef.current = setTimeout(() => {
      setTaskStatus("success");
      setTaskMessage("任务完成：已生成新版本 v4 · Mock");
      setVersions((items) => [
        {
          id: `v${items.length + 1}`,
          label: `v${items.length + 1}`,
          source: "通用章节写作 · Mock",
          time: "刚刚",
          summary: "基于本次显式授权材料生成，不覆盖此前版本。",
        },
        ...items,
      ]);
      setUnsavedChanges(false);
    }, 850);
  }, []);

  const cancelMockTask = useCallback(() => {
    if (taskTimerRef.current) clearTimeout(taskTimerRef.current);
    setTaskStatus("cancelled");
    setTaskMessage("任务已取消，没有创建新版本 · Mock");
  }, []);

  const failMockTask = useCallback(() => {
    if (taskTimerRef.current) clearTimeout(taskTimerRef.current);
    setTaskStatus("failed");
    setTaskMessage("主模型响应失败；是否使用 DeepSeek 备用模型重试？· Mock");
  }, []);

  const restoreVersion = useCallback((id: string) => {
    const source = initialVersions.find((item) => item.id === id);
    setVersions((items) => [
      {
        id: `restore-${Date.now()}`,
        label: `v${items.length + 1}`,
        source: `恢复 ${source?.label ?? id} · Mock`,
        time: "刚刚",
        summary: "恢复操作创建了新版本，原始版本与当前版本均未覆盖。",
      },
      ...items,
    ]);
  }, []);

  const value = useMemo<MockWorkspaceValue>(
    () => ({
      files,
      setFileStatus,
      retryFile,
      draftSaved,
      saveCreationDraft: () => setDraftSaved(true),
      diagnosis,
      diagnosisStatus,
      updateDiagnosis,
      confirmDiagnosis: () => setDiagnosisStatus("confirmed"),
      reopenDiagnosis: () => setDiagnosisStatus("updated"),
      outline,
      outlineConfirmed,
      updateOutlineTitle: (id, title) => {
        setOutline((items) => items.map((item) => (item.id === id ? { ...item, title } : item)));
        setOutlineConfirmed(false);
      },
      moveOutline,
      confirmOutline: () => setOutlineConfirmed(true),
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
      unsavedChanges,
      setUnsavedChanges,
    }),
    [
      diagnosis,
      diagnosisStatus,
      draftSaved,
      files,
      moveOutline,
      outline,
      outlineConfirmed,
      retryFile,
      runMockTask,
      selectedMaterialIds,
      selectedSectionId,
      selectedSkillId,
      setFileStatus,
      taskMessage,
      taskStatus,
      toggleMaterial,
      updateDiagnosis,
      unsavedChanges,
      versions,
      cancelMockTask,
      failMockTask,
      restoreVersion,
    ],
  );

  return <MockWorkspaceContext.Provider value={value}>{children}</MockWorkspaceContext.Provider>;
}

export function useMockWorkspace() {
  const context = useContext(MockWorkspaceContext);
  if (!context) {
    throw new Error("useMockWorkspace must be used inside MockWorkspaceProvider");
  }
  return context;
}

