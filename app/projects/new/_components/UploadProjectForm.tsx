"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMockWorkspace } from "@/app/lib/MockWorkspaceContext";
import {
  CreationReview,
  Field,
  FormActions,
  FormScaffold,
  FormSection,
  formStyles,
} from "./FormScaffold";

type UploadKind = "draft" | "requirements" | "literature" | "data";

type UploadState = "idle" | "uploading" | "stored" | "failed" | "cancelled";

type StoredMaterial = {
  originalFilename: string;
  detectedContentType: string;
  sizeBytes: number;
  objectStatus: string;
  materialStatus: string;
};

const copy = {
  draft: {
    eyebrow: "02 · 导入已有初稿",
    title: "保留原稿，再开始修改",
    description:
      "上传 DOCX、PDF、TXT，或先粘贴正文。原始版本只读保留，后续修改会创建新版本。",
    noteTitle: "原稿永不被覆盖",
    note: "演示流程会把初稿识别为一个独立的原始版本。无论润色、扩写还是恢复，都只会产生新版本。",
    pathLabel: "导入已有初稿",
    uploadTitle: "放入你的论文初稿",
    uploadHint: "支持 DOCX、PDF、TXT",
    fileId: "cancelled",
    defaultTitle: "数字平台中的知识协作机制研究",
  },
  requirements: {
    eyebrow: "03 · 上传论文要求",
    title: "把规则，变成清楚的约束",
    description:
      "课程题目、评分标准、学校模板、导师意见或投稿要求，都可以作为诊断依据。",
    noteTitle: "解析结果必须确认",
    note: "系统只把要求整理成候选约束。最终字数、格式、结构和截止日期仍需由你在诊断卡中确认。",
    pathLabel: "上传论文要求",
    uploadTitle: "放入要求、模板或批注",
    uploadHint: "支持 PDF、DOCX、TXT、JPG、JPEG、PNG",
    fileId: "requirements",
    defaultTitle: "课程论文要求整理",
  },
  literature: {
    eyebrow: "04 · 导入文献与范文",
    title: "把证据和写作参照分开",
    description:
      "文献用于支持判断；同水平范文用于分析结构与写作规范。二者都只基于你上传的材料。",
    noteTitle: "只分析，不复制",
    note: "范文只用于观察结构、论证节奏和引用规范，不复制原句；上传成功也不等于外部数据库已核验。",
    pathLabel: "导入文献与范文",
    uploadTitle: "加入一篇或多篇文献",
    uploadHint: "支持 PDF、DOCX、TXT；DOI / RIS / BibTeX 仅作文本记录演示",
    fileId: "literature",
    defaultTitle: "数字平台中的知识协作机制研究",
  },
  data: {
    eyebrow: "05 · 上传数据与研究材料",
    title: "先看清数据，再计划结果",
    description:
      "上传字段表、问卷、访谈、实验数据、语料或图片，先建立结构概览与缺失项清单。",
    noteTitle: "不会执行任意代码",
    note: "M2 不分析任何真实数据。后续也只在明确范围内读取材料，不会自动运行文件中的宏、脚本或外部代码。",
    pathLabel: "上传数据与研究材料",
    uploadTitle: "加入数据或研究材料",
    uploadHint: "支持 XLSX、CSV、TXT、JPG、JPEG、PNG",
    fileId: "data",
    defaultTitle: "远程协作访谈研究",
  },
} satisfies Record<
  UploadKind,
  {
    eyebrow: string;
    title: string;
    description: string;
    noteTitle: string;
    note: string;
    pathLabel: string;
    uploadTitle: string;
    uploadHint: string;
    fileId: string;
    defaultTitle: string;
  }
>;

export function UploadProjectForm({ kind }: { kind: UploadKind; state?: string }) {
  const router = useRouter();
  const { draftSaved, saveCreationDraft } = useMockWorkspace();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectTitle, setProjectTitle] = useState(copy[kind].defaultTitle);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState("");
  const [storedMaterial, setStoredMaterial] = useState<StoredMaterial | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const page = copy[kind];
  const materialSummary =
    uploadState === "stored"
      ? "1 个原始材料已安全存储 · 等待解析"
      : uploadState === "cancelled"
        ? "材料已取消，可先创建项目后再补充"
        : "尚未完成材料上传";

  function goBack() {
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function goNext() {
    if (step === 1) {
      setStep(2);
      if (selectedFile) void uploadSelectedFile();
      return;
    }
    setStep(3);
  }

  function createProject() {
    if (uploadState !== "uploading") {
      router.push(`/projects/${projectId ?? "demo"}/diagnosis`);
    }
  }

  async function ensureProject(signal: AbortSignal): Promise<string> {
    if (projectId) return projectId;
    const response = await fetch("/api/m4/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `upload-project:${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        primaryCreationMethod: creationMethod(kind),
        goal: projectTitle.trim() || page.defaultTitle,
        materialsSummary: "用户选择了需要安全保存的本机材料。",
        firstAiHelp: "先保存原始材料，稍后通过诊断卡确认下一步。",
      }),
      signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(apiMessage(payload, "无法创建项目草稿。"));
    const id = payload?.data?.project?.id;
    if (typeof id !== "string") throw new Error("项目接口没有返回有效 ID。");
    setProjectId(id);
    return id;
  }

  async function uploadSelectedFile() {
    if (!selectedFile || uploadState === "uploading") return;
    const controller = new AbortController();
    abortController.current = controller;
    setUploadState("uploading");
    setUploadError("");
    try {
      const targetProjectId = await ensureProject(controller.signal);
      const form = new FormData();
      form.set("file", selectedFile);
      form.set("kind", materialKind(kind, selectedFile.name));
      const response = await fetch(
        `/api/m5/projects/${targetProjectId}/materials`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `upload:${crypto.randomUUID()}` },
          body: form,
          signal: controller.signal,
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(apiMessage(payload, "文件上传失败。"));
      setStoredMaterial(payload.data.snapshot as StoredMaterial);
      setUploadState("stored");
    } catch (error) {
      if (controller.signal.aborted) {
        setUploadState("cancelled");
        setUploadError("上传已取消，原文件未标记为已存储。");
      } else {
        setUploadState("failed");
        setUploadError(error instanceof Error ? error.message : "文件上传失败。");
      }
    } finally {
      abortController.current = null;
    }
  }

  return (
    <FormScaffold
      eyebrow={page.eyebrow}
      title={page.title}
      description={page.description}
      noteTitle={page.noteTitle}
      note={page.note}
      step={step}
      realUpload
    >
      {step === 1 ? (
        <>
          <FormSection
            index="01"
            title={kind === "draft" ? "初稿与基础信息" : "材料用途"}
            description="先说明这批材料的用途，再进入真实上传与状态核对。"
          >
            <div className={formStyles.fieldGrid}>
              <Field label="项目暂定名称 *" full>
                <input
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="例如：数字平台中的知识协作机制研究"
                  aria-label="项目暂定名称"
                />
              </Field>
              {kind === "requirements" ? (
                <>
                  <Field label="要求类型">
                    <select defaultValue="course" aria-label="要求类型">
                      <option value="course">课程 / 作业要求</option>
                      <option value="school">学校格式</option>
                      <option value="advisor">导师意见</option>
                      <option value="journal">投稿要求</option>
                    </select>
                  </Field>
                  <Field label="要求来源">
                    <input defaultValue="学院课程平台" aria-label="要求来源" />
                  </Field>
                </>
              ) : null}
              {kind === "literature" ? (
                <div className={formStyles.fieldFull}>
                  <span className={formStyles.fieldLabel}>材料用途</span>
                  <div className={formStyles.choiceGrid}>
                    <label className={formStyles.choiceActive}>
                      <input defaultChecked name="material-use" type="radio" />
                      <strong>研究文献</strong>
                      <span>用于定位可回到原文核对的证据</span>
                    </label>
                    <label className={formStyles.choice}>
                      <input name="material-use" type="radio" />
                      <strong>同水平范文</strong>
                      <span>用于分析结构与写作规范</span>
                    </label>
                    <label className={formStyles.choice}>
                      <input name="material-use" type="radio" />
                      <strong>混合导入</strong>
                      <span>上传后再逐篇确认用途</span>
                    </label>
                  </div>
                </div>
              ) : null}
              {kind === "data" ? (
                <>
                  <Field label="数据类型">
                    <select defaultValue="interview" aria-label="数据类型">
                      <option value="interview">访谈 / 质性材料</option>
                      <option value="survey">问卷数据</option>
                      <option value="experiment">实验数据</option>
                      <option value="corpus">语料 / 编码表</option>
                      <option value="image">图片材料</option>
                    </select>
                  </Field>
                  <Field label="隐私状态">
                    <select defaultValue="anonymized" aria-label="隐私状态">
                      <option value="anonymized">已脱敏</option>
                      <option value="review">仍需检查</option>
                      <option value="unknown">不确定</option>
                    </select>
                  </Field>
                </>
              ) : null}
              {kind === "draft" ? (
                <Field label="粘贴正文（可选）" hint="上传与粘贴二选一即可。" full>
                  <textarea
                    placeholder="也可以先粘贴一小段正文，用于演示表单结构。"
                    aria-label="粘贴正文"
                  />
                </Field>
              ) : null}
              {kind === "requirements" ? (
                <Field label="直接填写要求（可选）" full>
                  <textarea
                    defaultValue="正文 8,000 字；需包含方法与结果；引用使用 APA 7th。"
                    aria-label="直接填写要求"
                  />
                </Field>
              ) : null}
            </div>
          </FormSection>

          <FormSection
            index="02"
            title={page.uploadTitle}
            description={`${page.uploadHint} · 原文件安全存储后进入等待解析状态`}
          >
            <label className={formStyles.uploadBox}>
              <input
                accept={
                  kind === "data"
                    ? ".xlsx,.csv,.txt,.jpg,.jpeg,.png"
                    : kind === "requirements"
                      ? ".pdf,.docx,.txt,.jpg,.jpeg,.png"
                      : kind === "literature"
                        ? ".docx,.pdf,.txt,.bib,.bibtex,.ris"
                        : ".docx,.pdf,.txt"
                }
                type="file"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setUploadState("idle");
                  setUploadError("");
                  setStoredMaterial(null);
                }}
              />
              <div>
                <strong>＋ 选择本机材料</strong>
                <span>
                  {selectedFile
                    ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}`
                    : "单个文件不超过 25 MB；旧 DOC、XLS 和可执行文件不支持。"}
                </span>
              </div>
            </label>
          </FormSection>
        </>
      ) : null}

      {step === 2 ? (
        <FormSection
          index="02"
          title="真实上传状态"
          description="本批次只安全保存原始对象，不读取正文，也不启动解析。"
        >
          <div className={formStyles.warningBox} aria-live="polite">
            <span className={formStyles.warningIcon} aria-hidden="true">
              {uploadState === "stored" ? "✓" : uploadState === "failed" ? "!" : "↑"}
            </span>
            <div>
              <strong>{uploadStatusTitle(uploadState)}</strong>
              <span>
                {storedMaterial
                  ? `${storedMaterial.originalFilename} · ${formatBytes(storedMaterial.sizeBytes)} · ${storedMaterial.detectedContentType} · ${storedMaterial.objectStatus} / AWAITING_PARSE`
                  : uploadError || selectedFile?.name || "尚未选择文件。"}
              </span>
            </div>
          </div>
          {uploadState === "uploading" ? (
            <button type="button" onClick={() => abortController.current?.abort()}>
              取消上传
            </button>
          ) : uploadState === "failed" || uploadState === "cancelled" ? (
            <button type="button" onClick={() => void uploadSelectedFile()}>
              重新上传
            </button>
          ) : null}
          <div className={kind === "draft" ? formStyles.protectionBox : formStyles.warningBox}>
            <span className={formStyles.warningIcon} aria-hidden="true">
              {kind === "draft" ? "原" : "!"}
            </span>
            <div>
              <strong>
                {kind === "draft"
                  ? "原始初稿只读保留"
                  : kind === "data"
                    ? "请先移除姓名、联系方式等敏感信息"
                    : "解析结果将在诊断卡中等待确认"}
              </strong>
              <span>
                {kind === "draft"
                  ? "AI 修改只会创建新版本，任何操作都不会覆盖原稿。"
                  : kind === "literature"
                    ? "仅基于用户上传原文定位证据，不声称已通过外部数据库验证。"
                    : kind === "data"
                      ? "系统不会执行宏、脚本或任意代码，也不会虚构研究结果。"
                      : "字数、格式与结构约束必须由用户核对，不能把自动提取当作最终要求。"}
              </span>
            </div>
          </div>
        </FormSection>
      ) : null}

      {step === 3 ? (
        <CreationReview
          pathLabel={page.pathLabel}
          title={projectTitle}
          materialSummary={materialSummary}
          persisted={uploadState === "stored"}
        />
      ) : null}

      <FormActions
        step={step}
        draftSaved={draftSaved}
        createDisabled={
          (step === 1 && !selectedFile) ||
          uploadState === "uploading" ||
          (step === 3 && uploadState !== "stored" && uploadState !== "cancelled")
        }
        onBack={goBack}
        onNext={goNext}
        onSave={saveCreationDraft}
        onCreate={createProject}
      />
    </FormScaffold>
  );
}

function creationMethod(kind: UploadKind) {
  return kind === "draft" ? "existing_draft" : kind;
}

function materialKind(kind: UploadKind, filename: string) {
  if (kind === "requirements") return "requirement";
  if (kind === "draft") return "manuscript";
  if (kind === "literature") return "literature";
  const extension = filename.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png"].includes(extension ?? "") ? "image" : "data";
}

function uploadStatusTitle(state: UploadState) {
  if (state === "uploading") return "正在安全上传原始文件";
  if (state === "stored") return "原始文件已存储，等待解析";
  if (state === "failed") return "上传失败，未标记为已存储";
  if (state === "cancelled") return "上传已取消";
  return "等待开始上传";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function apiMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}
