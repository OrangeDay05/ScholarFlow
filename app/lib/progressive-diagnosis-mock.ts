export type DiagnosisEntryMode =
  | "quick"
  | "guided"
  | "material"
  | "professional";

export type GuidanceDepth = "standard" | "deep";

export type DiagnosisFieldStatus =
  | "USER_CONFIRMED"
  | "AI_INFERRED"
  | "PENDING_CONFIRMATION"
  | "UNKNOWN"
  | "SKIPPED"
  | "MISSING_MATERIAL"
  | "NOT_APPLICABLE";

export type DiagnosisSourceType =
  | "USER_INPUT"
  | "MATERIAL_EXTRACTED"
  | "AI_RECOMMENDED"
  | "SYSTEM_DERIVED"
  | "IMPORTED";

export type DiagnosisConfidence = "HIGH" | "MEDIUM" | "LOW";

export type BlockingLevel =
  | "NONE"
  | "CURRENT_TASK"
  | "PROJECT_STAGE"
  | "HIGH_RISK_TASK"
  | "GLOBAL";

export type TaskReadinessStatus =
  | "READY"
  | "READY_WITH_WARNINGS"
  | "NEEDS_CONFIRMATION"
  | "NEEDS_MATERIAL"
  | "BLOCKED";

export type DiagnosisVersionStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "SUPERSEDED"
  | "ARCHIVED";

export type GuidanceQuestion = {
  question_id: string;
  session_id: string;
  topic: string;
  field_key: string;
  parent_question_id: string | null;
  depends_on_answer: string | null;
  question: string;
  why_this_matters: string;
  decision_impact: string;
  recommended_answer: string;
  recommendation_reason: string;
  options: Array<{ id: string; label: string }>;
  allow_custom_answer: boolean;
  allow_unknown: boolean;
  allow_skip: boolean;
  allow_ai_inference: boolean;
  blocking_level: BlockingLevel;
  source_material_ids: string[];
  source_locations: string[];
  answer: string | null;
  answer_status: DiagnosisFieldStatus | null;
  answer_source_type: DiagnosisSourceType | null;
  confidence: DiagnosisConfidence;
  asked_at: string | null;
  answered_at: string | null;
  deep_only?: boolean;
};

export type DiagnosisFieldRecord = {
  field: string;
  label: string;
  value: string;
  status: DiagnosisFieldStatus;
  source_type: DiagnosisSourceType;
  source_material_ids: string[];
  source_locations: string[];
  confidence: DiagnosisConfidence;
  requires_confirmation: boolean;
  rationale: string;
};

export type TaskReadinessItem = {
  id: string;
  task: string;
  status: TaskReadinessStatus;
  reason: string;
  nextAction: string;
};

export const diagnosisEntryModes: Array<{
  id: DiagnosisEntryMode;
  index: string;
  title: string;
  description: string;
  fit: string;
  steps: string;
  material: string;
  inference: string;
}> = [
  {
    id: "quick",
    index: "01",
    title: "快速开始",
    description: "只回答三个基础问题，立即得到简版诊断草稿和下一步。",
    fit: "只想先进入项目",
    steps: "最多 3 个问题",
    material: "材料可稍后上传",
    inference: "只给候选，不自动确认",
  },
  {
    id: "guided",
    index: "02",
    title: "AI 引导梳理",
    description: "一次解决一个关键问题，从已有想法和材料逐步收窄方向。",
    fit: "还不熟悉研究设计",
    steps: "标准 5—8 题；深度模式有上限",
    material: "优先读取已授权材料",
    inference: "推测始终等待确认",
  },
  {
    id: "material",
    index: "03",
    title: "从材料自动提取",
    description: "先展示提取结果、来源位置和置信度，再由你逐项确认。",
    fit: "已有初稿、要求或导师意见",
    steps: "按提取字段确认",
    material: "需要至少一份材料",
    inference: "提取结果默认不成为正式事实",
  },
  {
    id: "professional",
    index: "04",
    title: "完整专业填写",
    description: "直接编辑完整诊断卡；每个字段仍可不知道、跳过或标记不适用。",
    fit: "研究设计已经较明确",
    steps: "自主填写，不强制补齐",
    material: "可引用材料来源",
    inference: "AI 建议与用户事实分开",
  },
];

export const quickQuestions: GuidanceQuestion[] = [
  {
    question_id: "quick-goal",
    session_id: "guide-session-01",
    topic: "项目起点",
    field_key: "project_goal",
    parent_question_id: null,
    depends_on_answer: null,
    question: "你大概想研究、写作或完成什么？",
    why_this_matters: "先确定工作对象，系统才能判断接下来应收窄题目、整理材料还是规划论文。",
    decision_impact: "影响诊断路径、下一步任务和后续问题顺序。",
    recommended_answer: "研究 AI 生成英语阅读材料的难度，并与真实考试文本比较。",
    recommendation_reason: "你的初步想法聚焦文本难度，目前没有学习者实验数据，先研究文本特征更可执行。",
    options: [
      { id: "text", label: "比较 AI 文本和真实考试文本的难度" },
      { id: "learner", label: "研究学生阅读 AI 文本时的表现" },
      { id: "both", label: "文本难度和学生表现都研究" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "PROJECT_STAGE",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 2 页"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "quick-materials",
    session_id: "guide-session-01",
    topic: "现有材料",
    field_key: "available_materials",
    parent_question_id: "quick-goal",
    depends_on_answer: null,
    question: "你目前已经有哪些材料？",
    why_this_matters: "系统会先利用已有材料，避免重复询问已经能够可靠提取的信息。",
    decision_impact: "决定哪些字段可以从材料提取，以及哪些任务现在就能开展。",
    recommended_answer: "课程要求、几篇参考文献和一个初步想法。",
    recommendation_reason: "当前项目队列已显示一份课程要求和一篇参考文献。",
    options: [
      { id: "requirements", label: "课程、学校、导师或投稿要求" },
      { id: "literature", label: "参考论文或文献笔记" },
      { id: "draft", label: "已有初稿、开题报告或数据说明" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "NONE",
    source_material_ids: ["requirements", "literature"],
    source_locations: ["材料队列 · 2 份已授权材料"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "HIGH",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "quick-first-help",
    session_id: "guide-session-01",
    topic: "首要任务",
    field_key: "first_ai_task",
    parent_question_id: "quick-goal",
    depends_on_answer: null,
    question: "你希望 AI 首先帮助你完成什么？",
    why_this_matters: "诊断只需要补足当前任务所需的信息，不要求一次完成整张专业诊断卡。",
    decision_impact: "决定本次梳理的停止条件和任务级就绪检查。",
    recommended_answer: "先判断题目能不能做，并找出需要补充的信息。",
    recommendation_reason: "当前有初步想法和课程要求，但研究问题、方法和数据仍未完全确定。",
    options: [
      { id: "feasibility", label: "判断题目是否可做并找出缺口" },
      { id: "narrow", label: "帮助收窄题目和研究问题" },
      { id: "literature", label: "先整理文献和研究缺口" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "CURRENT_TASK",
    source_material_ids: [],
    source_locations: [],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
  },
];

export const guidedQuestions: GuidanceQuestion[] = [
  quickQuestions[0],
  {
    ...quickQuestions[2],
    question_id: "guide-task",
    parent_question_id: "quick-goal",
  },
  {
    question_id: "guide-focus",
    session_id: "guide-session-01",
    topic: "研究焦点",
    field_key: "research_focus",
    parent_question_id: "quick-goal",
    depends_on_answer: "text",
    question: "你更想比较文本本身，还是观察学习者阅读这些文本时的表现？",
    why_this_matters: "这是后续研究对象、数据来源和方法选择的父级问题。",
    decision_impact: "选择文本比较只需语料；选择学习者表现通常需要实验或学习者数据。",
    recommended_answer: "先比较 AI 文本和真实考试文本的难度。",
    recommendation_reason: "课程要求支持文本分析，但当前授权材料中没有学习者实验数据。",
    options: [
      { id: "text", label: "比较 AI 文本和真实考试文本的难度" },
      { id: "learner", label: "研究学生阅读 AI 文本时的实际表现" },
      { id: "both", label: "两者都研究" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "PROJECT_STAGE",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 2 页 · 作业目标"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-corpus",
    session_id: "guide-session-01",
    topic: "研究对象",
    field_key: "research_object",
    parent_question_id: "guide-focus",
    depends_on_answer: "text",
    question: "如果先比较文本，你准备把 AI 文本与哪一类真实文本比较？",
    why_this_matters: "可比语料的来源和范围会直接影响研究是否可执行。",
    decision_impact: "决定样本、语料规模、难度指标和结论适用范围。",
    recommended_answer: "与同等级英语考试阅读文本比较。",
    recommendation_reason: "课程要求提到教学适配，考试文本比随机网络文本有更清晰的难度基准。",
    options: [
      { id: "exam", label: "同等级英语考试阅读文本" },
      { id: "textbook", label: "同阶段教材阅读文本" },
      { id: "journal", label: "公开英语学习材料" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "PROJECT_STAGE",
    source_material_ids: ["requirements", "literature"],
    source_locations: ["课程要求.docx · 第 3 页", "参考论文.pdf · 第 4 页"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-data",
    session_id: "guide-session-01",
    topic: "数据条件",
    field_key: "data_source",
    parent_question_id: "guide-corpus",
    depends_on_answer: null,
    question: "你现在是否已经有可使用的文本、样本或真实研究数据？",
    why_this_matters: "系统不能把计划中的数据当成已经存在的真实数据。",
    decision_impact: "决定能否写方法、结果，还是只能先做文献探索和研究设计。",
    recommended_answer: "目前只有参考文本和要求，没有正式样本或分析结果。",
    recommendation_reason: "材料列表中没有可核验的正式数据集，旧 CSV 仍处于解析失败状态。",
    options: [
      { id: "ready", label: "已有可核验数据和来源说明" },
      { id: "partial", label: "只有部分样本，仍需补充" },
      { id: "none", label: "还没有正式数据" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "HIGH_RISK_TASK",
    source_material_ids: ["data"],
    source_locations: ["interview-coding.csv · 解析失败"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "HIGH",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-method",
    session_id: "guide-session-01",
    topic: "研究方法",
    field_key: "research_method",
    parent_question_id: "guide-data",
    depends_on_answer: "partial",
    question: "在现有条件下，你更接近哪一种基本研究设计？",
    why_this_matters: "方法必须与研究对象和可获得数据相匹配。",
    decision_impact: "影响分析指标、方法章节结构和可做出的结论。",
    recommended_answer: "语料库比较研究，先比较词汇、句法和可读性指标。",
    recommendation_reason: "当前焦点是文本特征，且尚无学习者实验数据。",
    options: [
      { id: "corpus", label: "语料库比较研究" },
      { id: "experiment", label: "学习者阅读实验" },
      { id: "mixed", label: "文本分析与学习者实验结合" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "CURRENT_TASK",
    source_material_ids: ["literature"],
    source_locations: ["参考论文.pdf · 第 6 页 · Methods"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-framework",
    session_id: "guide-session-01",
    topic: "理论框架",
    field_key: "theoretical_framework",
    parent_question_id: "guide-focus",
    depends_on_answer: null,
    question: "你已经确定理论框架，还是希望先保留候选方案？",
    why_this_matters: "未确定理论框架时可以推荐候选，但不能标记为已经采用。",
    decision_impact: "影响文献综述组织和变量解释，不阻塞早期文献探索。",
    recommended_answer: "先保留“文本复杂度与可读性”作为候选框架。",
    recommendation_reason: "现有文献涉及可读性，但材料不足以证明你已经正式采用某一理论。",
    options: [
      { id: "candidate", label: "先保留候选框架" },
      { id: "confirmed", label: "我已有明确框架，准备补充" },
      { id: "explore", label: "先通过文献探索再决定" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "NONE",
    source_material_ids: ["literature"],
    source_locations: ["参考论文.pdf · 第 2–3 页"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "LOW",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-deliverable",
    session_id: "guide-session-01",
    topic: "交付要求",
    field_key: "delivery_requirements",
    parent_question_id: "guide-task",
    depends_on_answer: null,
    question: "这次最需要优先满足哪些课程、学校、导师或投稿要求？",
    why_this_matters: "硬性要求会影响文章结构、语言、字数和引用格式。",
    decision_impact: "决定提纲边界和最终交付检查。",
    recommended_answer: "双语写作、APA 7th、约 12,000 字，先完成可行性诊断。",
    recommendation_reason: "这些要求来自已授权课程要求；截止日期仍未可靠提取。",
    options: [
      { id: "course", label: "课程或学校要求优先" },
      { id: "supervisor", label: "导师意见优先" },
      { id: "journal", label: "目标期刊要求优先" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "PROJECT_STAGE",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 1、4 页"],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "HIGH",
    asked_at: null,
    answered_at: null,
  },
  {
    question_id: "guide-risk",
    session_id: "guide-session-01",
    topic: "研究风险",
    field_key: "known_risks",
    parent_question_id: "guide-method",
    depends_on_answer: null,
    question: "你希望现在进一步核对哪一类高风险信息？",
    why_this_matters: "数据、正式引用和结果边界需要比早期题目探索更严格的确认。",
    decision_impact: "决定后续哪些任务保持警告或阻断。",
    recommended_answer: "先核对数据来源和样本可获得性。",
    recommendation_reason: "没有真实数据时，结果章节和因果结论不能开展。",
    options: [
      { id: "data", label: "数据和样本真实性" },
      { id: "citation", label: "正式引用和证据身份" },
      { id: "scope", label: "结论适用范围和过度声明" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "HIGH_RISK_TASK",
    source_material_ids: [],
    source_locations: [],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "MEDIUM",
    asked_at: null,
    answered_at: null,
    deep_only: true,
  },
  {
    question_id: "guide-statistics",
    session_id: "guide-session-01",
    topic: "分析方法",
    field_key: "analysis_method",
    parent_question_id: "guide-method",
    depends_on_answer: "corpus",
    question: "你已经确定统计或文本分析方法了吗？",
    why_this_matters: "分析方法应由研究问题、数据结构和样本条件共同决定。",
    decision_impact: "影响结果呈现，但当前不知道不会阻塞文献探索。",
    recommended_answer: "先保留描述统计、效应量和多指标文本比较为候选。",
    recommendation_reason: "真实样本量和数据分布尚未确认，现在不适合锁定具体检验。",
    options: [
      { id: "candidate", label: "保留候选，等数据后决定" },
      { id: "known", label: "我已经确定，准备补充" },
      { id: "support", label: "需要 AI 后续帮助选择" },
    ],
    allow_custom_answer: true,
    allow_unknown: true,
    allow_skip: true,
    allow_ai_inference: true,
    blocking_level: "NONE",
    source_material_ids: [],
    source_locations: [],
    answer: null,
    answer_status: null,
    answer_source_type: null,
    confidence: "LOW",
    asked_at: null,
    answered_at: null,
    deep_only: true,
  },
];

type ProjectDiagnosisContext = {
  title: string;
};

const neutralQuestionCopy: Record<
  string,
  Pick<
    GuidanceQuestion,
    | "question"
    | "recommended_answer"
    | "recommendation_reason"
    | "options"
  >
> = {
  "quick-materials": {
    question: "为了推进当前项目，你目前已经有哪些可使用的材料？",
    recommended_answer: "请按实际情况选择已有材料；系统不会把未上传或未授权的材料当成已存在。",
    recommendation_reason: "当前问题只用于确认真实材料范围，不预设你已经拥有某类文件。",
    options: [
      { id: "requirements", label: "课程、学校、导师或投稿要求" },
      { id: "literature", label: "参考论文或文献笔记" },
      { id: "draft", label: "已有初稿、数据或研究记录" },
    ],
  },
  "quick-first-help": {
    question: "针对当前项目，你希望 AI 首先帮助你完成什么？",
    recommended_answer: "先梳理当前目标、已知条件和关键缺口，再决定下一项任务。",
    recommendation_reason: "在没有更多已确认信息前，先做边界梳理比直接生成内容更稳妥。",
    options: [
      { id: "feasibility", label: "判断当前目标是否可做并找出缺口" },
      { id: "narrow", label: "帮助收窄研究焦点和问题" },
      { id: "literature", label: "先整理文献和证据需求" },
    ],
  },
  "guide-task": {
    question: "针对当前项目，你希望 AI 首先帮助你完成什么？",
    recommended_answer: "先梳理当前目标、已知条件和关键缺口，再决定下一项任务。",
    recommendation_reason: "在没有更多已确认信息前，先做边界梳理比直接生成内容更稳妥。",
    options: [
      { id: "feasibility", label: "判断当前目标是否可做并找出缺口" },
      { id: "narrow", label: "帮助收窄研究焦点和问题" },
      { id: "literature", label: "先整理文献和证据需求" },
    ],
  },
  "guide-focus": {
    question: "结合刚才确认的目标，你希望本项目优先聚焦哪一类问题？",
    recommended_answer: "先明确一个可核验的核心研究焦点，其他方向暂列为候选。",
    recommendation_reason: "聚焦单一核心问题有助于后续确定材料、方法和交付边界。",
    options: [
      { id: "object", label: "明确研究对象或现象" },
      { id: "relation", label: "解释变量、概念或机制之间的关系" },
      { id: "application", label: "解决一个具体实践或应用问题" },
    ],
  },
  "guide-corpus": {
    question: "围绕这个焦点，你计划研究哪些对象、案例、文本、参与者或数据？",
    recommended_answer: "先写明研究对象的类型、范围和可获得性；暂不确定的部分保留为待确认。",
    recommendation_reason: "当前没有足够证据替你指定具体样本或语料。",
    options: [
      { id: "defined", label: "对象和范围已经明确" },
      { id: "partial", label: "已有大致范围，仍需收窄" },
      { id: "unknown", label: "暂时还没有确定" },
    ],
  },
  "guide-data": {
    question: "你现在是否已有可核验、可授权使用的样本、文本或研究数据？",
    recommended_answer: "请按真实情况确认数据状态；计划采集的数据不能标记为已经存在。",
    recommendation_reason: "系统尚不能仅凭项目名称判断真实数据是否存在。",
    options: [
      { id: "ready", label: "已有可核验数据和来源说明" },
      { id: "partial", label: "只有部分材料或样本" },
      { id: "none", label: "还没有正式数据" },
    ],
  },
  "guide-method": {
    question: "根据你已确认的研究对象和数据条件，当前更接近哪一种研究设计？",
    recommended_answer: "先保留与你的研究问题和现有数据相匹配的方法候选，确认后再写入正式诊断卡。",
    recommendation_reason: "方法必须由研究问题和真实数据条件共同决定。",
    options: [
      { id: "qualitative", label: "质性研究或文本分析" },
      { id: "quantitative", label: "量化研究或统计分析" },
      { id: "mixed", label: "混合研究或尚需比较方案" },
    ],
  },
  "guide-framework": {
    question: "你已经确定理论或分析框架，还是希望先保留候选方案？",
    recommended_answer: "先保留候选框架，并在文献与研究问题核对后由你确认。",
    recommendation_reason: "仅凭项目标题不足以认定某个理论框架已经采用。",
    options: [
      { id: "candidate", label: "先保留候选框架" },
      { id: "confirmed", label: "已有明确框架，准备补充" },
      { id: "explore", label: "先通过文献探索再决定" },
    ],
  },
  "guide-deliverable": {
    question: "这次最需要优先满足哪些课程、学校、导师、期刊或其他交付要求？",
    recommended_answer: "请补充真实的语言、篇幅、格式、截止时间或评审要求。",
    recommendation_reason: "当前没有已核验材料支持系统预填具体字数或引用格式。",
    options: [
      { id: "course", label: "课程或学校要求优先" },
      { id: "supervisor", label: "导师或团队要求优先" },
      { id: "journal", label: "期刊、会议或答辩要求优先" },
    ],
  },
  "guide-risk": {
    question: "你希望现在进一步核对哪一类高风险信息？",
    recommended_answer: "优先核对最可能影响研究真实性或执行可行性的事项。",
    recommendation_reason: "高风险信息应由用户和真实材料确认，不能从示例项目继承。",
    options: [
      { id: "data", label: "数据、样本和材料真实性" },
      { id: "citation", label: "正式引用和证据身份" },
      { id: "scope", label: "结论范围、伦理或隐私边界" },
    ],
  },
  "guide-statistics": {
    question: "你是否已经确定与当前问题和数据相匹配的分析方法？",
    recommended_answer: "如果数据结构尚未确认，先保留分析方法候选，不锁定具体检验。",
    recommendation_reason: "统计或分析方法需要依据真实数据结构选择。",
    options: [
      { id: "candidate", label: "保留候选，等数据后决定" },
      { id: "known", label: "已经确定，准备补充" },
      { id: "support", label: "需要后续帮助选择" },
    ],
  },
};

export function createProjectDiagnosisQuestions(
  mode: DiagnosisEntryMode,
  depth: GuidanceDepth,
  context: ProjectDiagnosisContext,
): GuidanceQuestion[] {
  const selected =
    mode === "quick"
      ? quickQuestions
      : mode === "guided"
        ? guidedQuestions
            .filter((question) => depth === "deep" || !question.deep_only)
            .slice(0, depth === "standard" ? 6 : 10)
        : [];

  return selected.map((question) => {
    if (question.question_id === "quick-goal") {
      return {
        ...question,
        depends_on_answer: null,
        question: `当前项目是“${context.title}”。你这次具体想研究、写作或完成什么？`,
        recommended_answer: `以“${context.title}”为当前项目目标，先补充希望解决的核心问题和交付结果。`,
        recommendation_reason: "推荐内容只引用当前项目名称，不替用户虚构研究对象、数据或结论。",
        options: [
          { id: "clarify", label: "先明确目标和研究焦点" },
          { id: "materials", label: "先整理已有材料和证据" },
          { id: "draft", label: "先检查或修改已有内容" },
        ],
        source_material_ids: [],
        source_locations: [],
      };
    }
    const copy = neutralQuestionCopy[question.question_id];
    return {
      ...question,
      ...(copy ?? {}),
      depends_on_answer: null,
      source_material_ids: [],
      source_locations: [],
    };
  });
}

export const initialDiagnosisFields: DiagnosisFieldRecord[] = [
  {
    field: "project_goal",
    label: "项目目标",
    value: "研究 AI 生成英语阅读材料的难度",
    status: "USER_CONFIRMED",
    source_type: "USER_INPUT",
    source_material_ids: [],
    source_locations: [],
    confidence: "HIGH",
    requires_confirmation: false,
    rationale: "用户创建项目时直接输入。",
  },
  {
    field: "delivery_requirements",
    label: "交付要求",
    value: "双语写作；APA 7th；约 12,000 字",
    status: "PENDING_CONFIRMATION",
    source_type: "MATERIAL_EXTRACTED",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 1、4 页"],
    confidence: "HIGH",
    requires_confirmation: true,
    rationale: "从课程要求中提取，仍需用户确认适用范围。",
  },
  {
    field: "research_focus",
    label: "研究焦点",
    value: "比较 AI 文本和真实考试文本的难度",
    status: "AI_INFERRED",
    source_type: "AI_RECOMMENDED",
    source_material_ids: ["requirements", "literature"],
    source_locations: ["课程要求.docx · 第 2 页", "参考论文.pdf · 第 4 页"],
    confidence: "MEDIUM",
    requires_confirmation: true,
    rationale: "根据现有材料与缺少学习者实验数据推测。",
  },
  {
    field: "research_method",
    label: "研究方法",
    value: "",
    status: "UNKNOWN",
    source_type: "USER_INPUT",
    source_material_ids: [],
    source_locations: [],
    confidence: "LOW",
    requires_confirmation: true,
    rationale: "当前尚未决定，不影响早期文献探索。",
  },
  {
    field: "data_source",
    label: "数据来源",
    value: "",
    status: "MISSING_MATERIAL",
    source_type: "SYSTEM_DERIVED",
    source_material_ids: ["data"],
    source_locations: ["interview-coding.csv · 解析失败"],
    confidence: "HIGH",
    requires_confirmation: true,
    rationale: "没有可核验的正式样本或分析结果。",
  },
  {
    field: "theoretical_framework",
    label: "理论框架",
    value: "文本复杂度与可读性（候选）",
    status: "PENDING_CONFIRMATION",
    source_type: "AI_RECOMMENDED",
    source_material_ids: ["literature"],
    source_locations: ["参考论文.pdf · 第 2–3 页"],
    confidence: "LOW",
    requires_confirmation: true,
    rationale: "只能作为候选，不能视为已经采用。",
  },
  {
    field: "formal_title",
    label: "正式题目",
    value: "",
    status: "UNKNOWN",
    source_type: "USER_INPUT",
    source_material_ids: [],
    source_locations: [],
    confidence: "LOW",
    requires_confirmation: true,
    rationale: "正式题目可以在研究对象和数据范围明确后再决定。",
  },
  {
    field: "research_question",
    label: "研究问题",
    value: "AI 文本与同等级真实考试文本在语言难度上有何差异？（候选）",
    status: "PENDING_CONFIRMATION",
    source_type: "AI_RECOMMENDED",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 2 页"],
    confidence: "MEDIUM",
    requires_confirmation: true,
    rationale: "根据当前研究焦点形成的候选问题。",
  },
  {
    field: "sample",
    label: "样本或语料",
    value: "",
    status: "MISSING_MATERIAL",
    source_type: "SYSTEM_DERIVED",
    source_material_ids: [],
    source_locations: [],
    confidence: "HIGH",
    requires_confirmation: true,
    rationale: "尚未上传正式语料清单与抽样说明。",
  },
  {
    field: "target_journal",
    label: "目标期刊",
    value: "",
    status: "NOT_APPLICABLE",
    source_type: "USER_INPUT",
    source_material_ids: [],
    source_locations: [],
    confidence: "HIGH",
    requires_confirmation: false,
    rationale: "当前为课程项目，暂不需要目标期刊。",
  },
];

export const taskReadinessItems: TaskReadinessItem[] = [
  {
    id: "literature",
    task: "文献探索",
    status: "READY",
    reason: "已有研究主题和一份可读课程要求。",
    nextAction: "可以立即开始，不要求完整诊断卡。",
  },
  {
    id: "narrow",
    task: "题目收窄与研究问题候选",
    status: "READY_WITH_WARNINGS",
    reason: "研究焦点仍是 AI 推测，但足以生成候选方案。",
    nextAction: "输出必须标为候选，等待用户确认。",
  },
  {
    id: "method",
    task: "方法章节正式写作",
    status: "NEEDS_CONFIRMATION",
    reason: "研究对象、数据来源和基本研究设计尚未共同确认。",
    nextAction: "先确认语料范围和基本研究设计。",
  },
  {
    id: "results",
    task: "结果章节写作",
    status: "NEEDS_MATERIAL",
    reason: "缺少真实样本、分析方法和可核验结果。",
    nextAction: "上传真实数据与分析结果；系统不会生成虚构结果。",
  },
  {
    id: "citation",
    task: "正式引用与证据导出",
    status: "BLOCKED",
    reason: "参考文献仍在解析，尚未建立可核验身份和论断—证据绑定。",
    nextAction: "完成文献身份、原文位置和证据对应检查。",
  },
];

export const materialExtractedFields: DiagnosisFieldRecord[] =
  initialDiagnosisFields.filter(
    (field) =>
      field.source_type === "MATERIAL_EXTRACTED" ||
      field.source_type === "AI_RECOMMENDED",
  );

export const stopConditions = [
  "当前任务所需信息已经足够",
  "后续问题暂时不影响下一步",
  "用户选择先开始，稍后补充",
  "用户连续两次选择不知道",
  "必须上传新材料才能继续",
  "达到当前模式的问题上限",
  "用户主动结束或切换模式",
  "继续追问只能得到低可信度推测",
] as const;

export const diagnosisVersions: Array<{
  id: string;
  label: string;
  status: DiagnosisVersionStatus;
  source: string;
  detail: string;
}> = [
  {
    id: "diagnosis-v2",
    label: "D2",
    status: "PENDING_CONFIRMATION",
    source: "AI 引导梳理 · Mock",
    detail: "保留用户回答、材料提取、AI 推测和被拒绝建议。",
  },
  {
    id: "diagnosis-v1",
    label: "D1",
    status: "DRAFT",
    source: "创建项目",
    detail: "三个基础问题形成的初始草稿；永不覆盖。",
  },
];

export const diagnosisAuditItems = [
  "用户输入了项目目标 · USER_INPUT",
  "系统从课程要求提取交付约束 · MATERIAL_EXTRACTED",
  "AI 推荐文本比较方向 · AI_RECOMMENDED · 待确认",
  "用户把研究方法标记为当前不知道",
  "D2 由 Mock 引导会话生成，尚未写入正式诊断卡",
] as const;
