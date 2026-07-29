export type ReviewMode = "none" | "standard" | "strict";

export type ReviewConclusion =
  | "PASSED"
  | "PASSED_WITH_WARNINGS"
  | "REVISION_REQUIRED"
  | "BLOCKED"
  | "REVIEW_FAILED";

export type ReviewSeverity = "high" | "medium" | "low";

export type ReviewWorkflowStatus =
  | "idle"
  | "generating"
  | "reviewing"
  | "report_ready"
  | "revising"
  | "verifying"
  | "completed"
  | "review_failed";

export type ReviewDecision =
  | "pending"
  | "accepted_original"
  | "selected_for_revision"
  | "ignored";

export type ReviewModelOption = {
  id: string;
  provider: string;
  model: string;
  skill: string;
  skillVersion: string;
  note: string;
};

export type ReviewIssue = {
  id: string;
  category: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  suggestion: string;
};

export const reviewModes: Array<{
  id: ReviewMode;
  label: string;
  productMode: string;
  description: string;
  calls: string;
  duration: string;
}> = [
  {
    id: "none",
    label: "不复核",
    productMode: "快速模式",
    description: "只生成一个新版本，不创建审阅报告。",
    calls: "1 次",
    duration: "约 20–40 秒",
  },
  {
    id: "standard",
    label: "标准复核",
    productMode: "标准模式",
    description: "生成后由独立模型审阅一次，正文不被修改。",
    calls: "2 次",
    duration: "约 1–2 分钟",
  },
  {
    id: "strict",
    label: "严格复核",
    productMode: "严格模式",
    description: "生成、独立审阅，并允许一次修订和一次最终验证。",
    calls: "最多 4 次",
    duration: "约 2–4 分钟",
  },
];

export const generationModel: ReviewModelOption = {
  id: "openai-gpt52",
  provider: "OpenAI",
  model: "GPT-5.2",
  skill: "通用章节写作",
  skillVersion: "v1.3",
  note: "负责生成章节版本，不参与本次独立复核。",
};

export const reviewModelOptions: ReviewModelOption[] = [
  {
    id: "deepseek-v4-pro",
    provider: "DeepSeek",
    model: "DeepSeek V4 Pro · 思考 HIGH",
    skill: "独立学术审阅",
    skillVersion: "v0.1 Mock",
    note: "默认与生成模型使用不同供应商。",
  },
  {
    id: "openai-review",
    provider: "OpenAI",
    model: "GPT-5.2 Review",
    skill: "独立学术审阅",
    skillVersion: "v0.1 Mock",
    note: "同供应商的独立审阅配置，用于用户主动切换。",
  },
];

export const reviewDimensions = [
  "用户要求符合度",
  "项目约束符合度",
  "事实准确性",
  "引用和证据",
  "逻辑一致性",
  "研究问题与方法关系",
  "结果和结论边界",
  "过度声明",
  "缺失信息",
  "学术表达",
  "是否改变用户原意",
];

export const mockReviewIssues: ReviewIssue[] = [
  {
    id: "issue-evidence",
    category: "引用和证据",
    severity: "high",
    title: "“知识复用率提升 35%”缺少证据绑定",
    detail:
      "当前授权材料中没有可核对的原文、页码或段落，审阅模型不得凭自身知识判定该数值成立。",
    suggestion: "删除具体数值，或补充可核对的上传来源后重新审阅。",
  },
  {
    id: "issue-method",
    category: "研究问题与方法关系",
    severity: "high",
    title: "研究方法尚未支持因果性表述",
    detail:
      "诊断卡中的方法信息仍不完整，当前质性设计不能直接支持“平台规则导致效率提升”的因果结论。",
    suggestion: "将因果表述收窄为机制解释，并在方法章节补充样本与编码流程。",
  },
  {
    id: "issue-boundary",
    category: "结果和结论边界",
    severity: "medium",
    title: "讨论段提前使用了结论性语气",
    detail:
      "数据文件仍处于解析失败状态，当前文本应保持分析计划或待验证判断，不应写成已获得的发现。",
    suggestion: "改为“待检验的分析维度”，并保留缺失数据提示。",
  },
  {
    id: "issue-logic",
    category: "逻辑一致性",
    severity: "medium",
    title: "第二段与研究问题之间缺少过渡",
    detail:
      "平台规则、参与行为与协作结果之间的关系尚未明确，论证从文献缺口直接跳到研究问题。",
    suggestion: "增加一段机制链说明，连接概念缺口与两个研究问题。",
  },
  {
    id: "issue-expression",
    category: "学术表达",
    severity: "low",
    title: "“显著提升”可能构成过度声明",
    detail:
      "当前没有统计检验或充分材料支持“显著”一词，容易让读者误解为已完成量化验证。",
    suggestion: "改为“可能改善”或直接陈述待验证关系。",
  },
];

export const reviewWorkflowLabels: Record<ReviewWorkflowStatus, string> = {
  idle: "等待执行",
  generating: "生成中",
  reviewing: "独立审阅中",
  report_ready: "审阅报告待处理",
  revising: "生成修订版本中",
  verifying: "最终验证中",
  completed: "流程已完成",
  review_failed: "审阅失败",
};
