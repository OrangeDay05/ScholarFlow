# M0 前端 Mock 数据契约

状态：`BASELINE`  
适用里程碑：M1–M2  
所有者：Root Agent（M0-Agent D 工作流）  
约束：本文件只定义前端 Mock 与 Adapter 边界，不代表数据库、解析器、AI Provider 或 Skill 已实现。

## 1. 设计原则

1. 所有 Mock 数据必须在界面标注“演示数据”或“Mock”。
2. M1 只展示页面骨架与状态，不模拟不可见的真实后台能力。
3. M2 可以用内存 Mock Adapter 串联点击流程，但不得把 Mock 结果描述为真实解析或真实 AI 输出。
4. 正式数据层从 M3 开始接入；页面只能通过 Adapter 获取数据，避免直接依赖数据库形状。
5. 用户材料、AI 归纳、缺失信息和无法验证内容必须使用不同字段与视觉状态。
6. 用户侧只允许出现 DOCX 导出。

## 2. 共享枚举

```ts
export type Language = "zh" | "en" | "bilingual";

export type PaperType =
  | "course_paper"
  | "undergraduate_thesis"
  | "graduate_thesis"
  | "journal_article"
  | "conference_paper"
  | "other";

export type ProjectStatus =
  | "draft"
  | "diagnosing"
  | "awaiting_diagnosis_confirmation"
  | "active"
  | "archived"
  | "deleted";

export type DiagnosisStatus =
  | "not_started"
  | "draft"
  | "awaiting_confirmation"
  | "confirmed"
  | "needs_update";

export type MaterialType =
  | "requirement"
  | "manuscript"
  | "literature"
  | "reference_paper"
  | "data"
  | "image"
  | "note";

export type FileProcessingStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type SectionStatus =
  | "empty"
  | "draft"
  | "awaiting_user_confirmation"
  | "confirmed"
  | "needs_revision";

export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ProductSkill =
  | "project_diagnosis_outline"
  | "literature_summary_matrix"
  | "chapter_writing"
  | "general_revision"
  | "consistency_check"
  | "citation_evidence_check";

export type EvidenceSupportLevel = "direct" | "indirect" | "unverified";

export type InformationOrigin =
  | "user_confirmed"
  | "source_extracted"
  | "ai_inference"
  | "missing";

export type VersionOrigin =
  | "original_upload"
  | "user_save"
  | "ai_generation"
  | "ai_revision"
  | "restored_copy";
```

## 3. 核心实体

```ts
export interface MockUser {
  id: string;
  displayName: string;
  account: string;
  role: "user" | "admin";
  status: "active" | "frozen";
}

export interface ProjectSummary {
  id: string;
  title: string;
  paperType: PaperType;
  language: Language;
  targetWordCount: number | null;
  citationStyle: string | null;
  deadline: string | null;
  status: ProjectStatus;
  diagnosisStatus: DiagnosisStatus;
  progressPercent: number;
  currentStep: string;
  nextAction: string;
  updatedAt: string;
}

export interface ProjectRequirement {
  id: string;
  label: string;
  value: string;
  originMaterialId: string | null;
  origin: InformationOrigin;
  confirmed: boolean;
}

export interface MaterialRecord {
  id: string;
  projectId: string;
  fileName: string;
  extension: string;
  mimeType: string;
  materialType: MaterialType;
  sizeBytes: number;
  processingStatus: FileProcessingStatus;
  statusMessage: string;
  uploadedAt: string;
  userSelectedForTask: boolean;
  mock: true;
}

export interface DiagnosisField {
  key: string;
  label: string;
  value: string | string[];
  origin: InformationOrigin;
  editable: boolean;
  missingReason?: string;
}

export interface DiagnosisCard {
  id: string;
  projectId: string;
  status: DiagnosisStatus;
  version: number;
  clarityScore: number | null;
  fields: DiagnosisField[];
  risks: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
  confirmedAt: string | null;
  mock: true;
}

export interface OutlineSection {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  order: number;
  targetWordCount: number | null;
  actualWordCount: number;
  status: SectionStatus;
  blockedReason: string | null;
}

export interface SectionVersion {
  id: string;
  sectionId: string;
  versionNumber: number;
  origin: VersionOrigin;
  modelLabel: string | null;
  createdAt: string;
  createdByLabel: string;
  summary: string;
  isOriginal: boolean;
  content: string;
}

export interface EvidenceBinding {
  id: string;
  claimText: string;
  materialId: string | null;
  sourceFileName: string | null;
  page: number | null;
  paragraph: string | null;
  quote: string | null;
  supportLevel: EvidenceSupportLevel;
  verifiedScope: "uploaded_source_only" | "not_verified";
  warning: string | null;
}

export interface MockTask {
  id: string;
  projectId: string;
  sectionId: string | null;
  productSkill: ProductSkill;
  status: TaskStatus;
  selectedMaterialIds: string[];
  modelLabel: "ChatGPT · 主模型" | "DeepSeek · 备用模型" | "Mock Provider";
  startedAt: string | null;
  completedAt: string | null;
  errorStage: string | null;
  errorMessage: string | null;
  retryAllowed: boolean;
  mock: true;
}
```

## 4. 五种创建方式契约

```ts
export type CreationPath =
  | "idea"
  | "existing_draft"
  | "requirements"
  | "literature_and_reference_papers"
  | "data_and_materials";

export interface CreateProjectDraft {
  creationPath: CreationPath;
  titleOrIdea: string;
  paperType: PaperType;
  language: Language;
  targetWordCount: number | null;
  deadline: string | null;
  citationStyle: string | null;
  requirementNotes: string;
  queuedFiles: Array<{
    localId: string;
    fileName: string;
    extension: string;
    sizeBytes: number;
    materialType: MaterialType;
    status: FileProcessingStatus;
  }>;
}
```

M1 仅展示五类入口及各自表单骨架。M2 才用 Mock Adapter 演示队列状态变化。

## 5. 六个产品级 Skill 前端配置

```ts
export interface ProductSkillDefinition {
  id: ProductSkill;
  displayName: string;
  description: string;
  requiresConfirmedDiagnosis: boolean;
  requiresSelectedMaterials: boolean;
  resultType:
    | "diagnosis_card"
    | "outline"
    | "literature_matrix"
    | "chapter_version"
    | "revision_version"
    | "check_report"
    | "evidence_report";
}
```

前端固定展示：

1. 项目诊断与提纲；
2. 文献总结与文献矩阵；
3. 通用章节写作；
4. 通用修改；
5. 一致性检查；
6. 引用与证据检查。

内部 Skill 名称不得出现在普通用户页面。

## 6. SkillContext Mock

```ts
export interface SkillContextMock {
  runId: string;
  projectId: string;
  productSkill: ProductSkill;
  language: Language;
  paperType: PaperType;
  targetWordCount: number | null;
  deadline: string | null;
  citationStyle: string | null;
  confirmedDiagnosisCard: DiagnosisCard | null;
  projectRequirements: ProjectRequirement[];
  selectedMaterials: MaterialRecord[];
  chapterContext: {
    sectionId: string | null;
    chapterFunction: string | null;
    previousConfirmedSectionIds: string[];
  };
  allowedSources: {
    userUploadedOnly: true;
    externalSearchEnabled: false;
  };
  requestedOperation: string;
  modelConfigId: string;
}
```

前端门控：

- `chapter_writing` 在诊断卡未确认时必须显示阻断提示；
- 任何 Skill 未选择材料时必须提示用户确认可读材料；
- 没有数据时，结果/分析相关任务只能返回缺失信息，不能展示虚构结果；
- `consistency_check` 和 `citation_evidence_check` 只生成报告，不直接改写正文。

## 7. Adapter 边界

```ts
export interface ProjectAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary>;
  createProject(draft: CreateProjectDraft): Promise<ProjectSummary>;
  listMaterials(projectId: string): Promise<MaterialRecord[]>;
  getDiagnosis(projectId: string): Promise<DiagnosisCard | null>;
  saveDiagnosisDraft(card: DiagnosisCard): Promise<DiagnosisCard>;
  confirmDiagnosis(projectId: string, diagnosisId: string): Promise<DiagnosisCard>;
  listOutline(projectId: string): Promise<OutlineSection[]>;
  listSectionVersions(sectionId: string): Promise<SectionVersion[]>;
  listEvidence(sectionId: string): Promise<EvidenceBinding[]>;
  createMockTask(context: SkillContextMock): Promise<MockTask>;
}
```

M1 允许页面直接读取静态 Mock 常量。M2 必须通过 `MockProjectAdapter` 串联流程；M3 再增加正式 Adapter，不改变页面调用形状。

## 8. 页面间数据流

```text
/login 或 /register
  → /projects
  → /projects/new
  → /projects/new/idea（或其他四种入口）
  → /projects/demo/diagnosis
  → /projects/demo
  → /projects/demo/editor
```

M1 页面间仅需可导航并展示骨架。M2 才要求创建草稿、上传队列、确认诊断卡、生成 Mock 任务和版本变化形成完整状态流。

## 9. 页面状态契约

所有主要页面和关键区域至少提供：

- `loading`：Skeleton 或加载提示；
- `empty`：说明当前没有内容及下一步；
- `success`：完成状态和结果入口；
- `failed`：失败原因、可重试性；
- `warning`：缺失信息、未验证引用、诊断卡未确认；
- `mock`：明确标识演示数据。

M1 通过状态组件样例证明视觉语义；M2 将状态接入点击流程。

## 10. DOCX 导出前端契约

M1 编辑器只显示“导出 DOCX”入口，不触发真实文件生成。

```ts
export interface ExportPreflightMock {
  unsavedChanges: boolean;
  unconfirmedSections: string[];
  unverifiedCitationCount: number;
  citationReferenceMismatchCount: number;
  missingRequiredSections: string[];
  canExport: boolean;
}
```

用户侧不得出现 PDF 或 Markdown 选项。

## 11. M0 冻结项

- 六个产品级 Skill 的 ID 与展示名称；
- 五种项目创建方式的 ID；
- 页面路由命名；
- 页面状态枚举；
- 诊断卡确认门；
- 用户选择材料门；
- 版本来源枚举；
- 证据支持等级；
- Adapter 方法边界；
- DOCX 单一导出规则。

后续如修改这些冻结项，必须登记 `docs/change-log.md` 并更新验收矩阵。
