"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreationReview,
  Field,
  FormActions,
  FormScaffold,
  FormSection,
  formStyles,
} from "./FormScaffold";

type UploadKind = "idea" | "draft" | "requirements" | "literature" | "data";

type UploadState =
  | "idle"
  | "uploading"
  | "stored"
  | "parsing"
  | "parsed"
  | "parse_failed"
  | "failed"
  | "cancelled";

type StoredMaterial = {
  materialId: string;
  originalFilename: string;
  detectedContentType: string;
  sizeBytes: number;
  objectStatus: string;
  materialStatus: string;
};

const copy = {
  idea: {
    eyebrow: "01 · 从 Idea 开始",
    title: "把一个念头，变成研究起点",
    description: "先给出你已经知道的部分，也可以加入材料，让 AI 帮你填写创建信息候选。",
    noteTitle: "不替你编造研究",
    note: "没有材料支持的对象、方法和结论会被标为缺失。AI 填入内容只是候选，仍需你确认。",
    pathLabel: "从一个 Idea 开始",
    uploadTitle: "加入已有材料（可选）",
    uploadHint: "支持 DOCX、PDF、TXT、XLSX、CSV、JPG、JPEG、PNG",
    fileId: "idea",
    defaultTitle: "数字平台中的知识协作机制研究",
  },
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
    note: "系统只在用户明确授权的范围内读取材料，不会自动运行文件中的宏、脚本或外部代码。",
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
  const [draftSaved, setDraftSaved] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectTitle, setProjectTitle] = useState(copy[kind].defaultTitle);
  const [materialsSummary, setMaterialsSummary] = useState(
    kind === "idea" ? "目前只有一个初步想法，材料情况待补充。" : "本次创建所加入的材料。",
  );
  const [firstAiHelp, setFirstAiHelp] = useState(
    kind === "draft" ? "先识别初稿结构与缺口。" : "先读取材料并整理创建信息候选。",
  );
  const [aiFillState, setAiFillState] = useState<"idle" | "running" | "filled" | "failed">("idle");
  const [aiFillError, setAiFillError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState("");
  const [storedMaterials, setStoredMaterials] = useState<StoredMaterial[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const page = copy[kind];
  const materialStatusSummary =
    uploadState === "parsed"
      ? `${storedMaterials.length} 个原始材料已存储并解析成功`
      : uploadState === "parsing"
        ? `${storedMaterials.length} 个原始材料已存储 · 正在解析`
        : uploadState === "stored"
          ? `${storedMaterials.length} 个原始材料已存储 · 等待用户开始解析`
        : uploadState === "parse_failed"
          ? `${storedMaterials.length} 个原始材料已存储 · 部分材料解析失败`
      : uploadState === "cancelled"
        ? "材料已取消，可先创建项目后再补充"
        : "尚未完成材料上传";

  function goBack() {
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function goNext() {
    if (step === 1) {
      setStep(2);
      if (selectedFiles.length > 0) void uploadSelectedFiles();
      return;
    }
    setStep(3);
  }

  function runProcessingAction() {
    if (step !== 2) return;
    if (storedMaterials.length > 0) void retryParsing();
  }

  async function createProject() {
    if (uploadState !== "uploading" && uploadState !== "parsing") {
      try {
        if (!projectId) {
          const controller = new AbortController();
          const createdProjectId = await ensureProject(controller.signal);
          router.push(`/projects/${createdProjectId}/diagnosis/candidate`);
          return;
        }
        await persistIntake(projectId);
        router.push(`/projects/${projectId}/diagnosis/candidate`);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "项目创建失败。");
      }
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
        materialsSummary: materialsSummary.trim() || "材料情况待补充。",
        firstAiHelp: firstAiHelp.trim() || "先读取材料并整理创建信息候选。",
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

  function chooseFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []);
    setSelectedFiles(nextFiles);
    setUploadState("idle");
    setUploadError("");
    setStoredMaterials([]);
    setAiFillState("idle");
    setAiFillError("");
  }

  function removeFile(file: File) {
    setSelectedFiles((current) =>
      current.filter(
        (candidate) =>
          candidate.name !== file.name ||
          candidate.size !== file.size ||
          candidate.lastModified !== file.lastModified,
      ),
    );
    setUploadState("idle");
    setUploadError("");
    setStoredMaterials([]);
    setAiFillState("idle");
    setAiFillError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0 || uploadState === "uploading") return;
    const controller = new AbortController();
    const snapshots: StoredMaterial[] = [];
    abortController.current = controller;
    setUploadState("uploading");
    setUploadError("");
    try {
      const targetProjectId = await ensureProject(controller.signal);
      for (const selectedFile of selectedFiles) {
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
        snapshots.push(payload.data.snapshot as StoredMaterial);
        setStoredMaterials([...snapshots]);
      }
      setUploadState("stored");
    } catch (error) {
      if (controller.signal.aborted) {
        setUploadState("cancelled");
        setUploadError(snapshots.length > 0 ? "解析已取消，原文件仍已安全存储。" : "上传已取消，原文件未标记为已存储。");
      } else if (snapshots.length > 0) {
        setUploadState("parse_failed");
        setUploadError(error instanceof Error ? error.message : "材料解析失败。");
      } else {
        setUploadState("failed");
        setUploadError(error instanceof Error ? error.message : "文件上传失败。");
      }
    } finally {
      abortController.current = null;
    }
  }

  async function parseStoredMaterials(
    targetProjectId: string,
    materials: StoredMaterial[],
    signal: AbortSignal,
  ) {
      setUploadState("parsing");
      setUploadError("");
      for (const material of materials.filter((item) => item.materialStatus !== "success")) {
        const response = await fetch(
          `/api/m5/projects/${targetProjectId}/materials/${material.materialId}/parse`,
          {
            method: "POST",
            headers: { "Idempotency-Key": `creation-parse:${crypto.randomUUID()}` },
            signal,
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(apiMessage(payload, `《${material.originalFilename}》解析失败。`));
        setStoredMaterials((current) => current.map((item) => item.materialId === material.materialId
          ? { ...item, materialStatus: "success" }
          : item));
      }
      setUploadState("parsed");
  }

  async function retryParsing() {
    if (!projectId || storedMaterials.length === 0) return;
    const controller = new AbortController();
    abortController.current = controller;
    try {
      await parseStoredMaterials(projectId, storedMaterials, controller.signal);
    } catch (error) {
      setUploadState(controller.signal.aborted ? "cancelled" : "parse_failed");
      setUploadError(controller.signal.aborted ? "解析已取消，原文件仍已安全存储。" : error instanceof Error ? error.message : "材料解析失败。");
    } finally {
      abortController.current = null;
    }
  }

  async function fillFromMaterials() {
    if (!projectId || uploadState !== "parsed" || storedMaterials.length === 0 || aiFillState === "running") return;
    setAiFillState("running");
    setAiFillError("");
    try {
      const response = await fetch(`/api/m5/projects/${projectId}/creation-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          creationMethod: creationMethod(kind),
          materialIds: storedMaterials.map((material) => material.materialId),
          currentValues: { projectTitle, materialsSummary, firstAiHelp },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiMessage(payload, "AI 无法根据当前材料填写创建信息。"));
      const candidate = payload?.data?.candidate;
      if (!candidate || typeof candidate !== "object") throw new Error("AI 没有返回有效候选。");
      if (typeof candidate.projectTitle === "string" && candidate.projectTitle.trim()) setProjectTitle(candidate.projectTitle.trim());
      if (typeof candidate.materialsSummary === "string" && candidate.materialsSummary.trim()) setMaterialsSummary(candidate.materialsSummary.trim());
      if (typeof candidate.firstAiHelp === "string" && candidate.firstAiHelp.trim()) setFirstAiHelp(candidate.firstAiHelp.trim());
      setAiFillState("filled");
    } catch (error) {
      setAiFillState("failed");
      setAiFillError(error instanceof Error ? error.message : "AI 填写失败。");
    }
  }

  async function persistIntake(targetProjectId: string) {
    const response = await fetch(`/api/m4/projects/${targetProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: projectTitle.trim() || page.defaultTitle,
        materialsSummary: materialsSummary.trim() || "材料情况待补充。",
        firstAiHelp: firstAiHelp.trim() || "先读取材料并整理创建信息候选。",
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(apiMessage(payload, "创建信息候选保存失败。"));
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
              <Field
                label="项目暂定名称 *"
                aiState={selectedFiles.length > 0 ? (aiFillState === "filled" ? "filled" : "available") : undefined}
                full
              >
                <input
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="例如：数字平台中的知识协作机制研究"
                  aria-label="项目暂定名称"
                />
              </Field>
              <Field
                label={kind === "idea" ? "目前已经有哪些材料或信息？ *" : "这批材料主要包含什么？ *"}
                hint="AI 填入内容只作为创建候选，进入诊断卡前仍可修改。"
                aiState={selectedFiles.length > 0 ? (aiFillState === "filled" ? "filled" : "available") : undefined}
                full
              >
                <textarea
                  value={materialsSummary}
                  onChange={(event) => setMaterialsSummary(event.target.value)}
                  aria-label="材料与已有信息说明"
                />
              </Field>
              <Field
                label="希望 AI 首先帮助完成什么？ *"
                aiState={selectedFiles.length > 0 ? (aiFillState === "filled" ? "filled" : "available") : undefined}
                full
              >
                <textarea
                  value={firstAiHelp}
                  onChange={(event) => setFirstAiHelp(event.target.value)}
                  aria-label="希望 AI 首先帮助完成什么"
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
              {kind === "idea" ? (
                <div className={formStyles.infoBox}>
                  不上传文件也可以继续。上传后需由你明确开始读取；AI 只会填写带标识的候选字段。
                </div>
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
            <div className={formStyles.uploadArea}>
              <input
                ref={fileInput}
                className={formStyles.visuallyHidden}
                accept={
                  kind === "idea"
                    ? ".docx,.pdf,.txt,.xlsx,.csv,.jpg,.jpeg,.png"
                    : kind === "data"
                    ? ".xlsx,.csv,.txt,.jpg,.jpeg,.png"
                    : kind === "requirements"
                      ? ".pdf,.docx,.txt,.jpg,.jpeg,.png"
                      : kind === "literature"
                        ? ".docx,.pdf,.txt,.bib,.bibtex,.ris"
                        : ".docx,.pdf,.txt"
                }
                multiple
                tabIndex={-1}
                aria-hidden="true"
                type="file"
                onChange={(event) => chooseFiles(event.target.files)}
              />
              <button
                type="button"
                className={`${formStyles.uploadBox} ${isDragging ? formStyles.uploadBoxDragging : ""}`}
                onClick={() => fileInput.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  chooseFiles(event.dataTransfer.files);
                }}
                aria-label="选择或拖放本机材料"
                aria-describedby={`upload-help-${kind}`}
              >
                <strong>＋ 选择本机材料</strong>
                <span>也可以将文件拖放到这里</span>
                <small id={`upload-help-${kind}`}>
                  单个文件不超过 25 MB；旧 DOC、XLS 和可执行文件不支持。
                </small>
              </button>
              {selectedFiles.length > 0 ? (
                <div className={formStyles.fileSelection} aria-live="polite">
                  <strong>已选择 {selectedFiles.length} 个文件</strong>
                  <ul className={formStyles.fileList}>
                    {selectedFiles.map((file) => (
                      <li
                        className={formStyles.fileRow}
                        key={`${file.name}:${file.size}:${file.lastModified}`}
                      >
                        <div className={formStyles.fileDetails}>
                          <span className={formStyles.fileName}>{file.name}</span>
                          <small>
                            {formatBytes(file.size)} · {fileTypeLabel(file)} ·{" "}
                            {fileStatus(
                              uploadState,
                              storedMaterials.some(
                                (material) => material.originalFilename === file.name,
                              ),
                            )}
                          </small>
                        </div>
                        <button
                          type="button"
                          className={formStyles.removeFile}
                          onClick={() => removeFile(file)}
                          disabled={uploadState === "uploading"}
                          aria-label={`移除 ${file.name}`}
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </FormSection>
        </>
      ) : null}

      {step === 2 ? (
        <FormSection
          index="02"
          title="真实上传状态"
          description="先安全保存原始对象，再创建独立解析版本；解析结果不会覆盖原文件。"
        >
          <div className={formStyles.warningBox} aria-live="polite">
            <span className={formStyles.warningIcon} aria-hidden="true">
              {uploadState === "parsed" ? "✓" : uploadState === "failed" || uploadState === "parse_failed" ? "!" : "↑"}
            </span>
            <div>
              <strong>
                {kind === "idea" && selectedFiles.length === 0
                  ? "本次未加入材料，可直接下一步"
                  : uploadStatusTitle(uploadState)}
              </strong>
              <span>
                {storedMaterials.length > 0
                  ? uploadState === "parsed"
                    ? `${storedMaterials.length} 个原始文件已存储并解析成功`
                    : uploadState === "parsing"
                      ? `${storedMaterials.length} 个原始文件已存储 · 正在解析正文`
                      : uploadError || `${storedMaterials.length} 个原始文件已存储`
                  : uploadError || selectedFiles.map((file) => file.name).join("、") || "尚未选择文件。"}
              </span>
            </div>
          </div>
          {uploadState === "uploading" || uploadState === "parsing" ? (
            <button type="button" onClick={() => abortController.current?.abort()}>
              取消上传
            </button>
          ) : uploadState === "failed" || (uploadState === "cancelled" && storedMaterials.length === 0) ? (
            <button type="button" onClick={() => void (storedMaterials.length > 0 ? retryParsing() : uploadSelectedFiles())}>
              {storedMaterials.length > 0 ? "重新解析" : "重新上传"}
            </button>
          ) : null}
          {uploadState === "parsed" && storedMaterials.length > 0 ? (
            <button
              className={formStyles.aiFillButton}
              type="button"
              disabled={aiFillState === "running"}
              onClick={() => void fillFromMaterials()}
            >
              {aiFillState === "running"
                ? "AI 正在读取材料并填写…"
                : aiFillState === "filled"
                  ? "重新由 AI 填写候选"
                  : "AI 根据材料填入创建信息"}
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
                  : kind === "idea"
                    ? "Idea 路径允许稍后补充材料"
                  : kind === "data"
                    ? "请先移除姓名、联系方式等敏感信息"
                    : "解析结果将在诊断卡中等待确认"}
              </strong>
              <span>
                {kind === "draft"
                  ? "AI 修改只会创建新版本，任何操作都不会覆盖原稿。"
                  : kind === "idea"
                    ? "未加入材料时不会执行读取或 AI 填入；项目创建后仍可在诊断卡继续添加材料。"
                  : kind === "literature"
                    ? "仅基于用户上传原文定位证据，不声称已通过外部数据库验证。"
                    : kind === "data"
                      ? "系统不会执行宏、脚本或任意代码，也不会虚构研究结果。"
                      : "字数、格式与结构约束必须由用户核对，不能把自动提取当作最终要求。"}
              </span>
            </div>
          </div>
          {aiFillState === "filled" ? (
            <div className={formStyles.protectionBox} aria-live="polite">
              <span className={formStyles.warningIcon} aria-hidden="true">AI</span>
              <div>
                <strong>AI 已根据材料填写 3 个创建候选字段</strong>
                <span>可返回编辑查看和修改；这些内容尚未进入正式项目诊断卡。</span>
              </div>
            </div>
          ) : aiFillError ? (
            <div className={formStyles.warningBox} role="alert">
              <span className={formStyles.warningIcon} aria-hidden="true">!</span>
              <div><strong>AI 填写未完成</strong><span>{aiFillError}</span></div>
            </div>
          ) : null}
        </FormSection>
      ) : null}

      {step === 3 ? (
        <CreationReview
          pathLabel={page.pathLabel}
          title={projectTitle}
          materialSummary={materialStatusSummary}
          persisted={uploadState === "parsed" || uploadState === "parse_failed"}
        />
      ) : null}

      <FormActions
        step={step}
        draftSaved={draftSaved}
        createDisabled={
          (step === 1 && selectedFiles.length === 0) ||
          uploadState === "uploading" ||
          uploadState === "parsing" ||
          (step === 3 && uploadState !== "parsed" && uploadState !== "parse_failed" && uploadState !== "cancelled")
        }
        nextDisabled={
          step === 1
            ? kind !== "idea" && selectedFiles.length === 0
            : step === 2 && (uploadState === "uploading" || uploadState === "parsing" || uploadState === "stored" || uploadState === "failed")
        }
        nextLabel={step === 1 ? "查看处理列表" : "下一步"}
        processDisabled={
          uploadState === "idle" || uploadState === "uploading" || uploadState === "parsing" || uploadState === "failed" || uploadState === "parsed"
        }
        processLabel={
          step !== 2
            ? undefined
            : uploadState === "parsing"
              ? "正在读取…"
              : uploadState === "parsed"
                ? "读取完成"
                : uploadState === "parse_failed" || uploadState === "cancelled"
                  ? "重新读取"
                  : uploadState === "stored"
                    ? "确认开始读取"
                    : selectedFiles.length === 0
                      ? "暂无材料可读取"
                      : "等待原文件存储"
        }
        onBack={goBack}
        onNext={goNext}
        onProcess={runProcessingAction}
        onSave={() => setDraftSaved(true)}
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
  if (kind === "idea") {
    if (["jpg", "jpeg", "png"].includes(extension ?? "")) return "image";
    if (["xlsx", "csv"].includes(extension ?? "")) return "data";
    return "note";
  }
  return ["jpg", "jpeg", "png"].includes(extension ?? "") ? "image" : "data";
}

function uploadStatusTitle(state: UploadState) {
  if (state === "uploading") return "正在安全上传原始文件";
  if (state === "parsing") return "原始文件已存储，正在解析";
  if (state === "stored") return "原始文件已存储，等待开始解析";
  if (state === "parsed") return "原始文件已存储并解析成功";
  if (state === "parse_failed") return "原始文件已存储，但解析未完成";
  if (state === "failed") return "上传失败，未标记为已存储";
  if (state === "cancelled") return "上传已取消";
  return "等待开始上传";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileTypeLabel(file: File) {
  const extension = file.name.split(".").pop()?.toUpperCase();
  return extension || file.type || "未知类型";
}

function fileStatus(state: UploadState, stored: boolean) {
  if (state === "parsed") return "解析成功";
  if (state === "parsing") return "正在解析";
  if (state === "stored") return "原文件已存储，等待解析";
  if (state === "parse_failed") return "解析失败";
  if (stored) return "原文件已存储";
  if (state === "uploading") return "等待上传";
  return "已选择";
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
