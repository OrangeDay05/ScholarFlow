"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  createM3Project,
  loadM3Workspace,
  saveM3Diagnosis,
  saveM3Outline,
  saveM3SectionVersion,
} from "./m3-client";
import type {
  M3OutlineSection,
  M3SectionVersion,
} from "./m3-contracts";
import { M3_PERSISTENCE_ENABLED } from "./m3-features";
import type { DocumentContent } from "./document-model/types";

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
  content?: string;
  contentJson?: string | null;
};

type MockWorkspaceValue = {
  dataSource: "mock" | "d1";
  persistenceStatus: "disabled" | "loading" | "ready" | "error";
  persistenceError: string;
  files: FileQueueItem[];
  setFileStatus: (id: string, status: FileQueueStatus) => void;
  retryFile: (id: string) => void;
  draftSaved: boolean;
  saveCreationDraft: () => void;
  diagnosis: DiagnosisDraft;
  confirmedDiagnosis: DiagnosisDraft | null;
  diagnosisStatus: "draft" | "confirmed" | "updated";
  updateDiagnosis: (field: keyof DiagnosisDraft, value: string) => void;
  confirmDiagnosis: () => Promise<void>;
  reopenDiagnosis: () => void;
  outline: OutlineSection[];
  outlineConfirmed: boolean;
  updateOutlineTitle: (id: string, title: string) => void;
  moveOutline: (id: string, direction: -1 | 1) => void;
  confirmOutline: () => Promise<void>;
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
  sectionContents: Record<string, string>;
  sectionDocuments: Record<string, DocumentContent | null>;
  appendMockVersion: (version: Omit<VersionItem, "time">) => void;
  restoreVersion: (id: string) => Promise<void>;
  saveCurrentSection: (content: string, contentJson?: string | null) => Promise<void>;
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

const m3ToWorkspaceStatus: Record<
  M3OutlineSection["status"],
  OutlineSection["status"]
> = {
  not_started: "未开始",
  editing: "编辑中",
  checking: "待检查",
  confirmed: "已确认",
  missing_material: "缺少材料",
};

const workspaceToM3Status: Record<
  OutlineSection["status"],
  M3OutlineSection["status"]
> = {
  未开始: "not_started",
  编辑中: "editing",
  待检查: "checking",
  已确认: "confirmed",
  缺少材料: "missing_material",
};

const MockWorkspaceContext = createContext<MockWorkspaceValue | null>(null);

export function MockWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [dataSource, setDataSource] = useState<"mock" | "d1">("mock");
  const [persistenceStatus, setPersistenceStatus] = useState<
    "disabled" | "loading" | "ready" | "error"
  >(M3_PERSISTENCE_ENABLED ? "loading" : "disabled");
  const [persistenceError, setPersistenceError] = useState("");
  const [files, setFiles] = useState(initialFiles);
  const [draftSaved, setDraftSaved] = useState(false);
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState<DiagnosisDraft | null>(null);
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
  const [sectionVersions, setSectionVersions] = useState<
    Record<string, VersionItem[]>
  >({});
  const [unsavedChanges, setUnsavedChanges] = useState(true);
  const taskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceProjectIdRef = useRef("demo");

  useEffect(() => {
    if (!M3_PERSISTENCE_ENABLED) return;

    const match = pathname.match(
      /^\/projects\/([^/]+)\/(?:diagnosis|outline|editor|export)/,
    );
    if (!match) return;

    const requestedProjectId = decodeURIComponent(match[1]);
    const section =
      new URLSearchParams(window.location.search).get("section") ??
      "introduction";
    persistenceProjectIdRef.current = requestedProjectId;
    const controller = new AbortController();

    async function hydrate() {
      setPersistenceStatus("loading");
      setPersistenceError("");
      try {
        let snapshot;
        try {
          snapshot = await loadM3Workspace(requestedProjectId, section);
        } catch (error) {
          const maySeed =
            requestedProjectId === "demo" &&
            process.env.NEXT_PUBLIC_M3_AUTO_SEED_DEMO === "true";
          if (!maySeed) throw error;
          await createM3Project({
            title: initialDiagnosis.title,
            paperType: initialDiagnosis.paperType,
            language: initialDiagnosis.language,
            primaryCreationMethod: "requirements",
            researchObject: initialDiagnosis.researchObject,
            researchQuestion: initialDiagnosis.researchQuestion,
            method: initialDiagnosis.method,
            requirements: initialDiagnosis.requirements,
          });
          snapshot = await loadM3Workspace(requestedProjectId, section);
        }
        if (controller.signal.aborted) return;

        if (snapshot.diagnosis) {
          const nextDiagnosis: DiagnosisDraft = {
            title: snapshot.diagnosis.title,
            paperType: snapshot.diagnosis.paperType,
            language: snapshot.diagnosis.language,
            researchObject: snapshot.diagnosis.researchObject,
            researchQuestion: snapshot.diagnosis.researchQuestion,
            method: snapshot.diagnosis.method,
            requirements: snapshot.diagnosis.requirements,
          };
          setDiagnosis(nextDiagnosis);
          const confirmed = snapshot.diagnosis.status === "confirmed";
          setConfirmedDiagnosis(confirmed ? nextDiagnosis : null);
          setDiagnosisStatus(confirmed ? "confirmed" : "draft");
        }
        if (snapshot.outline?.sections.length) {
          setOutline(
            snapshot.outline.sections.map((item) => ({
              id: item.slug,
              index: String(item.position).padStart(2, "0"),
              title: item.title,
              status: m3ToWorkspaceStatus[item.status],
              words: item.wordCount,
            })),
          );
          setOutlineConfirmed(snapshot.outline.status === "confirmed");
        } else if (requestedProjectId === "demo") {
          setOutline(initialOutline);
          setOutlineConfirmed(false);
        }
        const versionEntries = await Promise.all(
          (snapshot.outline?.sections ?? []).map(async (sectionItem) => {
            const sectionSnapshot =
              sectionItem.slug === snapshot.selectedSectionSlug
                ? snapshot
                : await loadM3Workspace(requestedProjectId, sectionItem.slug);
            return [
              sectionItem.slug,
              sectionSnapshot.versions.map(toWorkspaceVersion),
            ] as const;
          }),
        );
        const nextSectionVersions = Object.fromEntries(versionEntries);
        setSelectedSectionId(snapshot.selectedSectionSlug);
        setSectionVersions(nextSectionVersions);
        setVersions(nextSectionVersions[snapshot.selectedSectionSlug] ?? []);
        setFiles(
          snapshot.materials.map((item) => ({
            id: item.id,
            name: item.filename,
            kind: item.kind,
            size: formatBytes(item.sizeBytes),
            status: item.status,
            detail: item.errorMessage ?? "材料元数据已保存 · M3",
          })),
        );
        setUnsavedChanges(false);
        setDataSource("d1");
        setPersistenceStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setPersistenceStatus("error");
        setPersistenceError(
          error instanceof Error ? error.message : "无法读取 M3 基础数据。",
        );
      }
    }

    void hydrate();
    return () => controller.abort();
  }, [pathname]);

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

  const confirmDiagnosis = useCallback(async () => {
    if (dataSource === "d1") {
      try {
        await saveM3Diagnosis(
          persistenceProjectIdRef.current,
          diagnosis,
          true,
        );
        setPersistenceError("");
      } catch (error) {
        setPersistenceStatus("error");
        setPersistenceError(
          error instanceof Error ? error.message : "诊断卡保存失败。",
        );
        throw error;
      }
    }
    setConfirmedDiagnosis({ ...diagnosis });
    setDiagnosisStatus("confirmed");
  }, [dataSource, diagnosis]);

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

  const confirmOutline = useCallback(async () => {
    if (dataSource === "d1") {
      try {
        await saveM3Outline(
          persistenceProjectIdRef.current,
          outline.map((section, index) => ({
            slug: section.id,
            title: section.title,
            position: index + 1,
            status: workspaceToM3Status[section.status],
            wordCount: section.words,
          })),
          true,
        );
        setPersistenceError("");
      } catch (error) {
        setPersistenceStatus("error");
        setPersistenceError(
          error instanceof Error ? error.message : "提纲保存失败。",
        );
        throw error;
      }
    }
    setOutlineConfirmed(true);
  }, [dataSource, outline]);

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

  const appendMockVersion = useCallback(
    (version: Omit<VersionItem, "time">) => {
      setVersions((items) => [
        { ...version, time: "刚刚" },
        ...items.filter((item) => item.id !== version.id),
      ]);
      setUnsavedChanges(false);
    },
    [],
  );

  const restoreVersion = useCallback(
    async (id: string) => {
      const source = versions.find((item) => item.id === id);
      if (dataSource === "d1") {
        try {
          const created = await saveM3SectionVersion(
            persistenceProjectIdRef.current,
            selectedSectionId,
            {
              source: "restore",
              sourceVersionId: id,
              summary: `恢复 ${source?.label ?? id}`,
            },
          );
          const nextVersion = toWorkspaceVersion(created);
          setVersions((items) => [nextVersion, ...items]);
          setSectionVersions((current) => ({
            ...current,
            [selectedSectionId]: [
              nextVersion,
              ...(current[selectedSectionId] ?? []),
            ],
          }));
          setPersistenceError("");
          return;
        } catch (error) {
          setPersistenceStatus("error");
          setPersistenceError(
            error instanceof Error ? error.message : "历史版本恢复失败。",
          );
          throw error;
        }
      }

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
    },
    [dataSource, selectedSectionId, versions],
  );

  const saveCurrentSection = useCallback(
    async (content: string, contentJson?: string | null) => {
      if (dataSource === "d1") {
        try {
          const created = await saveM3SectionVersion(
            persistenceProjectIdRef.current,
            selectedSectionId,
            {
              source: "manual",
              content,
              contentJson,
              summary: "人工保存当前章节",
            },
          );
          const nextVersion = toWorkspaceVersion(created);
          setVersions((items) => [nextVersion, ...items]);
          setSectionVersions((current) => ({
            ...current,
            [selectedSectionId]: [
              nextVersion,
              ...(current[selectedSectionId] ?? []),
            ],
          }));
          setPersistenceError("");
        } catch (error) {
          setPersistenceStatus("error");
          setPersistenceError(
            error instanceof Error ? error.message : "章节保存失败。",
          );
          throw error;
        }
      }
      setUnsavedChanges(false);
    },
    [dataSource, selectedSectionId],
  );

  const selectSection = useCallback(
    (id: string) => {
      setSelectedSectionId(id);
      if (dataSource === "d1") {
        setVersions(sectionVersions[id] ?? []);
      }
    },
    [dataSource, sectionVersions],
  );

  const value = useMemo<MockWorkspaceValue>(
    () => ({
      dataSource,
      persistenceStatus,
      persistenceError,
      files,
      setFileStatus,
      retryFile,
      draftSaved,
      saveCreationDraft: () => setDraftSaved(true),
      diagnosis,
      confirmedDiagnosis,
      diagnosisStatus,
      updateDiagnosis,
      confirmDiagnosis,
      reopenDiagnosis: () => setDiagnosisStatus("updated"),
      outline,
      outlineConfirmed,
      updateOutlineTitle: (id, title) => {
        setOutline((items) => items.map((item) => (item.id === id ? { ...item, title } : item)));
        setOutlineConfirmed(false);
      },
      moveOutline,
      confirmOutline,
      selectedSectionId,
      setSelectedSectionId: selectSection,
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
      sectionContents: Object.fromEntries(
        Object.entries(sectionVersions).map(([sectionId, items]) => [
          sectionId,
          items[0]?.content ?? "",
        ]),
      ),
      sectionDocuments: Object.fromEntries(
        Object.entries(sectionVersions).map(([sectionId, items]) => {
          const value = items[0]?.contentJson;
          if (!value) return [sectionId, null];
          try { return [sectionId, JSON.parse(value) as DocumentContent]; }
          catch { return [sectionId, null]; }
        }),
      ),
      appendMockVersion,
      restoreVersion,
      saveCurrentSection,
      unsavedChanges,
      setUnsavedChanges,
    }),
    [
      diagnosis,
      dataSource,
      confirmedDiagnosis,
      confirmDiagnosis,
      confirmOutline,
      diagnosisStatus,
      draftSaved,
      files,
      moveOutline,
      outline,
      outlineConfirmed,
      persistenceError,
      persistenceStatus,
      retryFile,
      runMockTask,
      selectedMaterialIds,
      selectedSectionId,
      sectionVersions,
      selectSection,
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
      appendMockVersion,
      restoreVersion,
      saveCurrentSection,
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

function toWorkspaceVersion(version: M3SectionVersion): VersionItem {
  const sourceLabels: Record<M3SectionVersion["source"], string> = {
    original: "原始版本",
    manual: "人工保存",
    ai: "AI 生成",
    restore: "历史恢复",
    fallback_model: "备用模型",
  };
  const createdAt = new Date(version.createdAt);

  return {
    id: version.id,
    label: `v${version.versionNumber}`,
    source: sourceLabels[version.source],
    time: Number.isNaN(createdAt.valueOf())
      ? version.createdAt
      : createdAt.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    summary: version.summary,
    content: version.content,
    contentJson: version.contentJson,
  };
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
