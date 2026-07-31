"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreationReview,
  EmptyMaterialQueue,
  Field,
  FormActions,
  FormScaffold,
  FormSection,
  formStyles,
} from "../_components/FormScaffold";

export default function IdeaProjectPage() {
  const router = useRouter();
  const [draftSaved, setDraftSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const idempotencyKey = useRef(`idea-project:${crypto.randomUUID()}`);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState(
    "数字平台中的知识协作机制：远程研究团队如何形成共同理解？",
  );
  const [existingMaterials, setExistingMaterials] = useState(
    "目前有课程要求、几篇参考文献和一个初步想法。",
  );
  const [firstHelp, setFirstHelp] = useState(
    "先判断这个题目能不能做，并找出需要补充的信息。",
  );

  function goBack() {
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function goNext() {
    setStep((current) => (current === 1 ? 2 : 3));
  }

  async function createProject() {
    if (creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const response = await fetch("/api/m4/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          primaryCreationMethod: "idea",
          goal: title,
          materialsSummary: existingMaterials,
          firstAiHelp: firstHelp,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "项目创建失败。");
      }
      const projectId = payload?.data?.project?.id;
      if (typeof projectId !== "string") throw new Error("项目接口没有返回有效 ID。");
      router.push(`/projects/${projectId}/diagnosis`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "项目创建失败。");
      setCreating(false);
    }
  }

  return (
    <FormScaffold
      eyebrow="01 · 从 Idea 开始"
      title="把一个念头，变成研究起点"
      description="先给出你已经知道的部分。研究对象、方法或引用格式不确定也没关系，诊断卡会把缺口明确列出来。"
      noteTitle="不替你编造研究"
      note="这一入口只整理你提供的想法与约束。没有材料支持的对象、方法和结论会被标为缺失，而不是自动补全。"
      step={step}
    >
      {step === 1 ? (
        <FormSection
          index="01"
          title="创建项目只需要这 3 个回答"
          description="不需要专业术语。正式题目、研究问题、方法、数据和引用格式都可以在 AI 引导梳理中渐进补充。"
        >
          <div className={formStyles.fieldGrid}>
            <Field label="1. 你大概想研究、写作或完成什么？" full>
              <textarea
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="你大概想研究写作或完成什么"
              />
            </Field>
            <Field label="2. 你目前已经有哪些材料？" hint="没有材料或不确定也可以直接说明" full>
              <textarea
                value={existingMaterials}
                onChange={(event) => setExistingMaterials(event.target.value)}
                aria-label="你目前已经有哪些材料"
              />
            </Field>
            <Field label="3. 你希望 AI 首先帮助你完成什么？" full>
              <textarea
                value={firstHelp}
                onChange={(event) => setFirstHelp(event.target.value)}
                aria-label="你希望 AI 首先帮助你完成什么"
              />
            </Field>
          </div>
          <div className={formStyles.infoBox}>
            不知道研究方法、理论框架或统计方法不会阻止创建。后续每个专业字段都可以选择不知道、跳过、不适用或稍后补充。
          </div>
        </FormSection>
      ) : null}

      {step === 2 ? (
        <FormSection
          index="02"
          title="确认材料与研究边界"
          description="Idea 路径也必须经过本步骤，不能一键越过创建确认。"
        >
          <EmptyMaterialQueue />
          <div className={formStyles.warningBox}>
            <span className={formStyles.warningIcon} aria-hidden="true">
              !
            </span>
            <div>
              <strong>当前只能生成研究起点与诊断卡草稿</strong>
              <span>
                没有文献或数据时，系统不会虚构引用、实验、访谈或研究结果。你可以创建后继续补充材料。
              </span>
            </div>
          </div>
        </FormSection>
      ) : null}

      {step === 3 ? (
        <>
          <CreationReview
            pathLabel="从一个 Idea 开始"
            title={title}
            materialSummary={`${existingMaterials} 首要帮助：${firstHelp}`}
          />
          {createError ? (
            <div className={formStyles.warningBox} role="alert">
              <span className={formStyles.warningIcon} aria-hidden="true">!</span>
              <div><strong>项目创建失败</strong><span>{createError}</span></div>
            </div>
          ) : null}
        </>
      ) : null}

      <FormActions
        step={step}
        draftSaved={draftSaved}
        createDisabled={creating}
        createDisabledLabel="正在创建…"
        onBack={goBack}
        onNext={goNext}
        onSave={() => setDraftSaved(true)}
        onCreate={() => void createProject()}
      />
    </FormScaffold>
  );
}
