"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMockWorkspace } from "@/app/lib/MockWorkspaceContext";
import {
  CreationReview,
  Field,
  FormActions,
  FormScaffold,
  FormSection,
  UploadQueue,
  formStyles,
} from "./FormScaffold";

type UploadKind = "draft" | "requirements" | "literature" | "data";

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
    uploadHint: "支持 XLSX、XLS、CSV、TXT、JPG、JPEG、PNG",
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
  const {
    files,
    draftSaved,
    saveCreationDraft,
    setFileStatus,
    retryFile,
  } = useMockWorkspace();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectTitle, setProjectTitle] = useState(copy[kind].defaultTitle);
  const page = copy[kind];

  const selectedFiles = useMemo(
    () => files.filter((file) => file.id === page.fileId),
    [files, page.fileId],
  );
  const blockingFiles = selectedFiles.filter((file) =>
    ["queued", "parsing", "failed"].includes(file.status),
  );
  const successfulFiles = selectedFiles.filter((file) => file.status === "success");
  const cancelledFiles = selectedFiles.filter((file) => file.status === "cancelled");
  const materialSummary =
    successfulFiles.length > 0
      ? `${successfulFiles.length} 个材料已就绪 · Mock`
      : cancelledFiles.length > 0
        ? "材料已取消，可先创建项目后再补充"
        : "仍有材料等待处理";

  function goBack() {
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function goNext() {
    setStep((current) => (current === 1 ? 2 : 3));
  }

  function createProject() {
    if (blockingFiles.length === 0) {
      router.push("/projects/demo/diagnosis");
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
    >
      {step === 1 ? (
        <>
          <FormSection
            index="01"
            title={kind === "draft" ? "初稿与基础信息" : "材料用途"}
            description="先说明这批材料的用途，再进入 Mock 处理队列。"
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
            description={`${page.uploadHint} · 文件类型仅作前端演示提示`}
          >
            <label className={formStyles.uploadBox}>
              <input
                accept={
                  kind === "data"
                    ? ".xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png"
                    : kind === "requirements"
                      ? ".pdf,.docx,.txt,.jpg,.jpeg,.png"
                      : ".docx,.pdf,.txt"
                }
                type="file"
              />
              <div>
                <strong>＋ 选择本机材料</strong>
                <span>
                  选择器只用于展示文件类型范围，不读取内容、不上传、不保存。下一步显示预置
                  Mock 队列。
                </span>
              </div>
            </label>
          </FormSection>
        </>
      ) : null}

      {step === 2 ? (
        <FormSection
          index="02"
          title="核对 Mock 处理队列"
          description="你可以完成模拟解析、取消材料，或在失败后重试。"
        >
          <UploadQueue
            files={selectedFiles}
            onSetStatus={setFileStatus}
            onRetry={retryFile}
          />
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
        />
      ) : null}

      <FormActions
        step={step}
        draftSaved={draftSaved}
        createDisabled={step === 3 && blockingFiles.length > 0}
        onBack={goBack}
        onNext={goNext}
        onSave={saveCreationDraft}
        onCreate={createProject}
      />
    </FormScaffold>
  );
}
