# M5 V0.5.1 实施批次

日期：2026-07-28

分支：`m5/real-services-foundation`

状态：`M5_IN_PROGRESS`

## 1. 起点

- M4 已通过，CORE-01、I-015 和 I-016 已解除。
- M4 已提供项目/材料/诊断/任务/隐私/模型/PPT 数据契约、Repository、API、所有者隔离和 0000→0005 迁移链。
- M5 不能把 M3 Mock 或已安装 Skill 直接称为真实能力；每项真实能力必须有 Adapter、持久化、失败状态、权限边界和测试证据。
- OpenAI 作为默认生成供应商、DeepSeek 作为备用供应商；没有平台或用户凭据时不得发起调用或伪装成功。
- Nature Review Studio 继续默认关闭，直到 DOCX 输出契约、依赖和隐私审计问题单独解决。

## 2. 当前差距

| 能力 | 当前 | M5 目标 |
|---|---|---|
| 文件 | 只有材料元数据和解析结果契约 | 真实上传、对象存储、格式解析、版本和失败原因 |
| Provider | 只有 Provider/Model 元数据 | 可测试、可超时、可取消的真实 Adapter |
| 凭据 | 只有掩码和密文引用 | 服务端加密、作用域校验、连接测试、撤销 |
| AI Task | 状态机与审阅持久化 | 真实 Runner、恢复、预算、限流和降级 |
| 六个 Skill | 前端 Mock 与映射 | 统一上下文、真实 Adapter、结构化输出和版本门 |
| 动态诊断 | Mock 问题树 | 基于已授权材料的真实动态提问与停止条件 |
| 隐私 | 画像、处理副本和外传计划契约 | 真实处理副本、保真检查和外传前确认 |
| 文献发现 | 页面 Mock | 合法来源检索、元数据核验和状态分级 |

## 3. 小批次

### M5-B1：真实执行共享契约

- 目标：冻结六 Skill 输入输出、Provider Adapter、凭据解析、调用上限、超时和恢复边界。
- 依赖：M4-H2。
- 修改：`app/lib/m5-*.ts`、`tests/m5-*.test.mjs`、项目管理文档。
- 数据模型/API：本批不迁移、不新增 API。
- 测试：TypeScript、局部 ESLint、契约测试、既有回归。
- 验收：无明文凭据；六 Skill 不增不减；2/3/4 模型与 2/4/5 调用上限；章节写作诊断门；任务恢复分类明确。
- 风险：把接口误报为真实调用。
- 停止条件：契约与 M4 状态机或隐私门冲突。

### M5-B2：对话优先 AI 工作台与长期 Agent 基础

- 目标：在不移除六个产品 Skill 的前提下，增加“对话 Agent / Skill 任务”双页签、Conversation Agent、六个默认 Prompt、ToolIntent、长期会话摘要、Action Proposal 和用户确认门。
- 依赖：B1 共享契约。
- 修改：`app/lib/m5-conversation-agent.ts`、编辑器 AI 工作台、后续会话 Repository/API 与测试。
- 验收：对话只产生结构化意图和提案；用户确认前不运行；摘要不冒充用户确认事实；原 Skill 任务完整保留。
- 风险：对话绕过任务门、摘要被误认事实、双页签破坏 M2 工作台。
- 停止条件：任何提案未经确认即执行，或需要真实 Provider 才能继续。

拆分执行：

- M5-B2A（DONE）：顶层双页签、Conversation Agent 前端基础、六 Skill 默认 Prompt、ToolIntent、会话摘要、Action Proposal 和显式确认门；当前不持久化、不执行真实任务。
- M5-B2B（DONE）：长期会话、消息和派生摘要 Repository/API 持久化、幂等、归档与所有者隔离；0007 仅生成未执行。
- M5-B2C（DONE）：ToolIntent、Action Proposal、一次性用户决定和恢复状态持久化；确认只到 `READY_TO_QUEUE`，不创建或执行 AI Task；0008 仅生成未执行。
- M5-B2D（DONE）：有界消息分页、追加式压缩计划、连续摘要来源、恢复快照、幂等失败重试与权限完整回归；无新迁移，I-017 仍留待真实 Runner。

### M5-B3：真实材料、文件解析与项目知识库

- 目标：不可覆盖上传、对象存储、格式解析、解析版本、来源定位和项目知识库。
- 依赖：B1；Conversation Agent 通过 ToolIntent 引用材料范围。
- 已完成 M5-B3A：Storage Adapter、本地持久化 R2、上传安全、0006 对象记录、Session 隔离和补偿；文件只到 `AWAITING_PARSE`。
- M5-B3B（DONE）：TXT/CSV/BibTeX/RIS、ParseRun/Chunk、行/记录/字段来源位置、失败状态和重解析版本。
- M5-B3C（DONE）：DOCX 段落/标题定位与文本型 PDF 逐页解析；ZIP、页数、图像和超时受限；扫描 PDF 不伪装 OCR 成功。
- M5-B3D（DONE）：XLSX Sheet/行/单元格/公式来源与 PNG/JPEG 基础资产登记；不执行公式、不承诺图像理解。
- M5-B3E（DONE）：项目内最新成功 ParseRun 的基础全文检索、来源返回、查询限制与所有者隔离；不声称向量或外部检索。
- 验收：原文件保留；新解析不覆盖；位置可追踪；失败不伪装 READY。
- 停止条件：解析破坏原文件、来源位置丢失或项目隔离失败。

### M5-B4：真实 Provider、凭据与六个 Skill Adapter

- 目标：平台凭据、用户 Key 服务端加密、OpenAI/DeepSeek Provider Adapter 与六个 Skill Adapter。
- 依赖：B1、B2、B3，且必须先解决 M5-FU-02。
- 验收：明文不落库/日志/响应；无凭据不调用；Provider 错误统一；Skill 不私自定义供应商请求。
- 停止条件：无主密钥、无用户明确提交动作、日志出现秘密或外传范围不明。

状态：DONE。用户 Key 仅由 M5 显式操作接收，使用 owner/credential AAD 的 AES-GCM-256 保存于独立表；OpenAI/DeepSeek 使用统一 Adapter 与错误；六 Skill 共用同一 Provider 请求结构。未配置主密钥或凭据时硬阻断，本批验证未发送真实 Key 或外部模型请求。

### M5-B5：执行、审阅、候选版本、DOCX 与完整收尾

- 目标：可恢复 Runner、预算/取消/降级、生成与独立审阅、候选/采用版本、真实 DOCX 以及 M5 审核包。
- 依赖：B1—B4，且必须先解决 M5-FU-01。
- 验收：成功产物保留；失败不标通过；审阅不覆盖正文；禁止无限循环；DOCX 真实验证；停在 M5 审核门。
- 停止条件：幂等、预算、版本、证据或隐私门无法证明。

## 4. 当前决定

当前 M5-B1、M5-B2A—B2D 与重分类后的 M5-B3A 已完成，M5-B2 等待整体审核。当前不调用外部模型、不接收真实 Key、不执行真实解析、不生成 DOCX、不部署。
