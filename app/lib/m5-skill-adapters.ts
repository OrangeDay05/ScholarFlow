import type { M5ProductSkill, M5SkillContext } from "./m5-execution-contracts";
import type { M5ProviderMessage, M5ProviderRequest } from "./m5-provider-adapter";

const prompts: Record<M5ProductSkill, string> = {
  project_diagnosis_outline: "梳理项目诊断与提纲；区分用户事实、材料提取、AI 推测和缺失信息。",
  literature_summary_matrix: "仅根据授权且可定位的材料生成文献总结与矩阵；标记原文事实、AI 归纳和缺失项。",
  chapter_writing: "根据已确认诊断卡与授权材料起草章节；不得虚构数据、结果、引用或来源。",
  general_revision: "在不改变用户原意和事实边界的前提下修改文本；输出新候选版本，不覆盖原稿。",
  consistency_check: "检查研究问题、方法、结果、讨论、结论和术语一致性；只生成报告，不修改正文。",
  citation_evidence_check: "核对论断、引用和证据位置；无法核对时标记 UNVERIFIED，不得凭模型知识确认。",
};

export function buildM5SkillProviderRequest(input: {
  context: M5SkillContext;
  modelKey: string;
  modelVersion: string;
  taskRole: M5ProviderRequest["taskRole"];
  userInstruction: string;
  materialContext: string;
  timeoutSeconds: number;
  maxOutputTokens: number;
}): M5ProviderRequest {
  const messages: M5ProviderMessage[] = [
    { role: "system", content: `${prompts[input.context.productSkill]}\n所有输出必须保留事实状态和来源；缺失信息不得补写为事实。` },
    { role: "user", content: `用户要求：\n${input.userInstruction}\n\n授权材料上下文：\n${input.materialContext}` },
  ];
  return { requestId: input.context.runId, modelKey: input.modelKey, modelVersion: input.modelVersion, taskRole: input.taskRole, messages, maxOutputTokens: input.maxOutputTokens, timeoutSeconds: input.timeoutSeconds };
}
