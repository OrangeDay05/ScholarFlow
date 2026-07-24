export type CreationPath = {
  id: "idea" | "draft" | "requirements" | "literature" | "data";
  index: string;
  mark: string;
  title: string;
  description: string;
  detail: string;
  href: string;
  tone: "forest" | "leaf" | "emerald" | "sage" | "mist";
};

export type ProductSkill = {
  id: string;
  index: string;
  title: string;
  description: string;
  state: "可用" | "需确认";
};

export const creationPaths: CreationPath[] = [
  {
    id: "idea",
    index: "01",
    mark: "意",
    title: "从一个 Idea 开始",
    description: "把朦胧的问题，整理成可执行的研究计划。",
    detail: "填写研究主题、对象、问题、语言与目标字数。",
    href: "/projects/new/idea",
    tone: "forest",
  },
  {
    id: "draft",
    index: "02",
    mark: "文",
    title: "导入已有初稿",
    description: "识别章节、论点与缺口，原稿始终保留。",
    detail: "支持 Word、PDF、TXT，M1 仅展示上传队列。",
    href: "/projects/new/existing-draft",
    tone: "leaf",
  },
  {
    id: "requirements",
    index: "03",
    mark: "规",
    title: "上传论文要求",
    description: "把课程、学校、导师或投稿规则变成硬约束。",
    detail: "可填写要求，或上传模板、评分标准等材料。",
    href: "/projects/new/requirements",
    tone: "emerald",
  },
  {
    id: "literature",
    index: "04",
    mark: "引",
    title: "导入文献与范文",
    description: "提取证据，分析同水平论文的结构与写作规范。",
    detail: "支持一篇或多篇文献与参考论文。",
    href: "/projects/new/literature",
    tone: "sage",
  },
  {
    id: "data",
    index: "05",
    mark: "数",
    title: "上传数据与研究材料",
    description: "先看清字段、变量和缺口，再计划结果章节。",
    detail: "支持 Excel、CSV、TXT 与图片；不会执行任意代码。",
    href: "/projects/new/data",
    tone: "mist",
  },
];

export const productSkills: ProductSkill[] = [
  {
    id: "project-diagnosis",
    index: "01",
    title: "项目诊断与提纲",
    description: "更新诊断卡、识别缺口并组织论文目录。",
    state: "可用",
  },
  {
    id: "literature-matrix",
    index: "02",
    title: "文献总结与文献矩阵",
    description: "总结用户上传的原文并保留来源位置。",
    state: "可用",
  },
  {
    id: "chapter-writing",
    index: "03",
    title: "通用章节写作",
    description: "基于已确认诊断卡和显式授权材料起草章节。",
    state: "需确认",
  },
  {
    id: "revision",
    index: "04",
    title: "通用修改",
    description: "润色、精简、扩写、翻译并创建新版本。",
    state: "可用",
  },
  {
    id: "consistency",
    index: "05",
    title: "一致性检查",
    description: "检查问题、方法、结果、结论与术语的一致性。",
    state: "可用",
  },
  {
    id: "evidence",
    index: "06",
    title: "引用与证据检查",
    description: "把重要判断绑定到已上传原文并标记证据强度。",
    state: "可用",
  },
];

export const projectOutline = [
  { index: "01", title: "摘要", state: "待完善", words: 286 },
  { index: "02", title: "引言", state: "编辑中", words: 1248 },
  { index: "03", title: "文献综述", state: "待检查", words: 2180 },
  { index: "04", title: "研究方法", state: "已确认", words: 1620 },
  { index: "05", title: "结果与讨论", state: "缺少数据", words: 640 },
  { index: "06", title: "结论", state: "未开始", words: 0 },
];

export const demoProjects = [
  {
    id: "demo",
    title: "数字平台中的知识协作机制研究",
    type: "期刊论文",
    language: "中文",
    progress: 46,
    phase: "确认诊断卡",
    next: "核对研究对象与方法后确认诊断卡",
    updated: "今天 20:36",
    tone: "primary",
  },
  {
    id: "urban",
    title: "城市更新背景下的社区韧性评估",
    type: "硕士论文",
    language: "中文",
    progress: 72,
    phase: "章节写作",
    next: "补充结果章节的数据证据",
    updated: "昨天 18:12",
    tone: "secondary",
  },
];

