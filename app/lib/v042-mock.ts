export type V042Capability = {
  slug: string;
  index: string;
  kicker: string;
  title: string;
  summary: string;
  prompt: string;
  inputs: string[];
  steps: string[];
  outputs: string[];
  preview: {
    label: string;
    title: string;
    detail: string;
  }[];
};

export const v042Capabilities: V042Capability[] = [
  {
    slug: "idea-exploration",
    index: "01",
    kicker: "IDEA EXPLORATION",
    title: "Idea 探索",
    summary: "把零散想法整理为研究问题、概念边界与下一步验证清单。",
    prompt: "输入一个研究念头，或从当前项目的诊断卡继续探索。",
    inputs: ["研究想法或现象", "目标学科与论文类型", "可用材料与现实限制"],
    steps: ["澄清研究现象", "展开问题分支", "比较可行性", "形成研究起点"],
    outputs: ["问题树", "概念边界", "可行性提示", "下一步材料清单"],
    preview: [
      {
        label: "核心现象",
        title: "远程协作中的知识如何被看见、复用与追溯？",
        detail: "保留现象描述，不提前把研究问题写成结论。",
      },
      {
        label: "候选切口",
        title: "规则设计、反馈可见性与协作持续性",
        detail: "三个方向仍需文献与数据验证。",
      },
      {
        label: "下一步",
        title: "先补 3–5 篇同领域综述与样本边界",
        detail: "确认材料后再进入项目诊断与提纲。",
      },
    ],
  },
  {
    slug: "external-literature",
    index: "02",
    kicker: "EXTERNAL LITERATURE",
    title: "外部文献",
    summary: "为外部检索、候选文献筛选与导入项目建立独立工作区。",
    prompt: "描述检索主题、时间范围与来源偏好，先生成演示检索计划。",
    inputs: ["主题词与同义词", "时间、语言和文献类型", "目标数据库或公开来源"],
    steps: ["构造检索式", "查看候选来源", "标记待读条目", "授权导入项目"],
    outputs: ["检索策略", "候选文献清单", "待读队列", "导入记录"],
    preview: [
      {
        label: "检索策略",
        title: "platform governance × knowledge collaboration",
        detail: "当前仅展示检索式结构，未连接任何外部数据库。",
      },
      {
        label: "候选条目",
        title: "12 条演示结果等待来源核验",
        detail: "题录、全文与访问状态均不会被伪装为已获取。",
      },
      {
        label: "导入边界",
        title: "用户确认后才进入项目材料",
        detail: "外部候选来源不自动成为正文证据。",
      },
    ],
  },
  {
    slug: "advanced-review",
    index: "03",
    kicker: "ADVANCED REVIEW",
    title: "高级审稿",
    summary: "从论证、方法、证据和表达多个视角组织审稿问题。",
    prompt: "选择论文版本与审稿强度，生成演示版多视角审稿任务。",
    inputs: ["待审论文版本", "目标期刊或评价标准", "重点关注的问题"],
    steps: ["定义审稿视角", "逐节检查", "合并重复问题", "按严重度排序"],
    outputs: ["总体判断", "主要问题", "次要问题", "修改优先级"],
    preview: [
      {
        label: "主要问题",
        title: "研究问题与结果章节的对应关系不足",
        detail: "需要逐项说明每个结果如何回应研究问题。",
      },
      {
        label: "证据边界",
        title: "两处经验性判断缺少可核验材料",
        detail: "演示审稿不会补造数据或外部引用。",
      },
      {
        label: "修改顺序",
        title: "先证据，再结构，最后处理语言",
        detail: "优先修复影响结论有效性的高风险问题。",
      },
    ],
  },
  {
    slug: "submission-revision",
    index: "04",
    kicker: "SUBMISSION REVISION",
    title: "投稿返修",
    summary: "把编辑决定与审稿意见整理为逐条回应和修改任务。",
    prompt: "导入决定信、审稿意见和对应稿件版本，建立演示返修矩阵。",
    inputs: ["编辑决定信", "审稿意见", "投稿稿件与当前修订稿"],
    steps: ["拆分意见", "定位原文", "规划修改", "组织逐条回复"],
    outputs: ["返修矩阵", "逐条回复草稿", "修改定位", "未解决问题"],
    preview: [
      {
        label: "Reviewer 1 · #03",
        title: "请说明样本筛选标准",
        detail: "定位至方法章节；需要用户补充真实筛选过程。",
      },
      {
        label: "回应策略",
        title: "接受意见并补充方法边界",
        detail: "不会在缺少材料时自动编写不存在的样本信息。",
      },
      {
        label: "版本保护",
        title: "返修稿将作为新版本创建",
        detail: "原投稿版本和既有章节版本保持可追溯。",
      },
    ],
  },
  {
    slug: "research-figures",
    index: "05",
    kicker: "RESEARCH FIGURES",
    title: "科研图件",
    summary: "从研究逻辑或数据需求出发，规划图表与概念图件。",
    prompt: "说明图件用途、读者和可用数据，先生成演示图件简报。",
    inputs: ["图件目的", "数据或论证结构", "期刊尺寸与风格要求"],
    steps: ["选择图件类型", "组织信息层级", "生成图件简报", "检查标注与来源"],
    outputs: ["图件清单", "视觉结构", "图注草稿", "数据缺口"],
    preview: [
      {
        label: "推荐图件",
        title: "平台规则—协作行为—知识结果概念图",
        detail: "用于表达理论关系，不代表已经验证的因果结果。",
      },
      {
        label: "信息层级",
        title: "三列主结构 + 证据边界说明",
        detail: "沿用研序的绿色与米白色视觉体系。",
      },
      {
        label: "待补材料",
        title: "期刊版心尺寸与最终变量名称",
        detail: "确认后才能进入真实制图与导出。",
      },
    ],
  },
  {
    slug: "presentations",
    index: "06",
    kicker: "RESEARCH PRESENTATIONS",
    title: "PPT",
    summary: "把论文、研究计划或汇报目标转化为演示叙事与页面清单。",
    prompt: "选择汇报场景与时长，生成演示版结构和关键页面预览。",
    inputs: ["汇报场景与对象", "时长或页数", "论文、提纲或研究材料"],
    steps: ["提炼主线", "分配页面", "组织视觉证据", "检查讲述节奏"],
    outputs: ["演示结构", "逐页要点", "视觉建议", "讲述备注"],
    preview: [
      {
        label: "建议结构",
        title: "问题—缺口—方法—发现—贡献",
        detail: "15 分钟学术汇报的演示叙事骨架。",
      },
      {
        label: "关键页面",
        title: "第 4 页：研究缺口与问题",
        detail: "用一张关系图承接文献综述与研究设计。",
      },
      {
        label: "真实性边界",
        title: "只使用已授权的项目材料",
        detail: "当前页面不会生成或导出真实 PPT 文件。",
      },
    ],
  },
];

export function getV042Capability(slug: string) {
  return v042Capabilities.find((capability) => capability.slug === slug);
}
