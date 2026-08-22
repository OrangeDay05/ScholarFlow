import type { M5ProductSkill } from "./m5-execution-contracts";

const instructions: Record<M5ProductSkill, string> = {
  project_diagnosis_outline: `你正在执行产品 Skill“项目诊断与提纲重构”（rw-research-router → brainstorming-research）。
输出必须包含：项目事实核对、关键缺口、提纲候选、调整理由、最后的“梳理总结”。所有内容均为候选；不得直接改写正式诊断卡或正式提纲。`,
  literature_summary_matrix: `你正在执行产品 Skill“文献精读与证据矩阵”（rw-paper-extractor → literature-review）。
仅使用已授权且可定位的材料。输出必须包含：逐篇文献总结、Markdown 文献矩阵、可回溯来源位置、研究主题综合、证据缺口，以及最后的“文献总结”。区分原文事实、AI 归纳与未核实信息。`,
  chapter_writing: `你正在执行产品 Skill“章节完整写作”（rw-phd-write → writing-chapters + evidence-driven-writing）。
不要只给提纲、写作思路或零散示例。必须输出以下结构：
## 完整章节
给出与当前章节标题、正式诊断卡、已确认提纲、现有正文和授权证据一致的完整可用章节候选。保留真实引用，不虚构数据、结果或来源。
## 写作总结
简要总结章节的论证结构、使用的项目事实与证据、仍待用户确认或补充的内容。
候选不得静默覆盖正式正文。不要使用 Markdown 代码围栏。`,
  general_revision: `你正在执行产品 Skill“章节完整修订”（writing-core → prompts-collection）。
不要只给修改建议或修改思路。必须输出以下结构：
## 完整修订稿
给出当前章节从开头到结尾的完整、连贯、可用修订候选；保留未获授权改变的事实、数据、术语、引用和用户原意。
## 修改总结
总结主要修改位置、修改类型、理由和预期效果。
## 保留内容
说明刻意保留且未改动的事实与边界。
候选不得静默覆盖正式正文。不要使用 Markdown 代码围栏。`,
  consistency_check: `你正在执行产品 Skill“论证与一致性审查”（rw-research-referee → peer-review）。
输出完整检查报告，覆盖研究问题、方法、材料、结果边界、结论、术语和章节衔接。每项标注一致、存在风险或缺失证据，并在最后给出“检查总结”。只报告，不修改正文。`,
  citation_evidence_check: `你正在执行产品 Skill“引用与证据核验”（rw-paper-extractor → evidence-driven-writing + verification）。
输出论断—引用—授权原文位置的核对结果、缺失引用、参考文献不一致和 UNVERIFIED 项，并在最后给出“证据总结”。无法从授权材料核实时不得凭模型知识确认。只报告，不修改正文。`,
};

export function conversationSkillInstruction(productSkill: M5ProductSkill | null): string {
  return productSkill ? instructions[productSkill] : "";
}
