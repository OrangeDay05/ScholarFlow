# M4 V0.5.1 审核报告

日期：2026-07-28

分支：`m4/progressive-diagnosis-persistence`

状态：`WAITING_FOR_REVIEW · M4_PASS`

## 1. 目标与边界

M4 将 M3 已批准的渐进式诊断、多模型复核和扩展业务 Mock 转化为可迁移的数据契约、所有者隔离 Repository、API 与测试。M2 三栏写作工作台、M3 前端和视觉体系保持不变。

本阶段没有接入真实模型、供应商或新增 Skill；不收集真实 API Key；不执行真实自动脱敏；不生成 PPTX；不部署；不进入 M5。

## 2. 完成批次与检查点

| Batch | 内容 | Commit |
|---|---|---|
| M4-B1 | V0.5.1 需求基线、差距矩阵与批次冻结 | `3c71f02` |
| M4-B2 | 五种项目起点、三个最低问题、材料元数据与所有者隔离 | `716651a` |
| M4-B3 | 渐进式诊断、字段来源/状态、版本、审计和任务就绪 | `fe36968` |
| M4-B4 | AI Task 状态机、父子任务、审阅、用户决定和采用版本 | `aa1bc2e` |
| M4-B5 | 隐私画像、处理副本、伪匿名引用、外传和分析保真 | `841f304` |
| M4-B6 | PPT 场景/版本/来源与模型、凭据、ExecutionProfile 元数据 | `3b472a5` |
| M4-B7 | API 隔离、迁移预检、全量 QA 与审核门 | 本报告对应提交 |
| M4-H1 | I-015 方案 A：归档旧 D1、新持久化 D1 与运行时重启验收 | 本轮独立提交 |

## 3. 页面与既有前端

M4 没有重写 M2/M3 页面。登录、项目列表、五种创建入口、诊断卡、论文目录、三栏编辑器、章节版本、引用证据、DOCX 预检以及 M3 增量 Mock 均继续保留。新增持久化由显式 M4 功能开关控制；关闭后仍使用原 M2/M3 体验。

相关页面：

- `/projects/new` 及五种创建入口
- `/projects/:projectId/diagnosis`
- `/projects/:projectId/outline`
- `/projects/:projectId/editor`
- `/settings/models`
- `/admin/models-skills`

本阶段新增 API：

- `/api/m4/projects`
- `/api/m4/projects/:projectId/materials`
- `/api/m4/projects/:projectId/diagnosis`
- `/api/m4/projects/:projectId/tasks`
- `/api/m4/projects/:projectId/privacy`
- `/api/m4/projects/:projectId/presentations`
- `/api/m4/projects/:projectId/model-configs`

## 4. 数据契约

### 项目、材料与诊断

- 五种起点均可记录，且创建只要求三个最低问题。
- 材料 API 仅登记元数据，不宣称已上传、解析或保存对象。
- 诊断会话、问题、答案、字段状态、字段来源、置信度、材料位置、任务就绪和审计事件分别保存。
- 诊断版本支持 `DRAFT`、`PENDING_CONFIRMATION`、`CONFIRMED`、`SUPERSEDED`、`ARCHIVED`；修改与恢复均追加版本。
- AI 推测与用户确认保持分离，诊断不完整不会锁死整个项目。

### AI Task、审阅与版本

- 支持 18 个任务状态、父子任务、幂等键、调用预算、超时和停止原因。
- 角色分别记录 `GENERATOR`、`REVIEWER`、`VERIFIER`、`REVISER`、`ROUTER`、`AGGREGATOR`。
- ReviewReport、ReviewIssue 和用户处理决定独立于正文；审阅不会覆盖被审版本。
- 生成稿、汇总候选稿、修订稿和采用版本关系可追溯；部分失败不会标记为通过。

### 隐私与分析保真

- 区分直接标识符、间接标识符、敏感属性、研究必要变量、普通研究正文、伦理/保密限制、版权/合同限制。
- 支持 `RAW_ALLOWED`、`SELECTIVE_REDACTION`、`PSEUDONYMIZED`、`AGGREGATED_ONLY`、`LOCAL_ONLY`、`EXTERNAL_BLOCKED`。
- 处理副本、受控伪匿名映射引用、任务材料外传计划和七项分析保真检查分别记录。
- `LOCAL_ONLY`、`EXTERNAL_BLOCKED` 或保真检查失败时不能形成可执行外传计划。
- 本阶段只保存策略与审计数据，不执行真实自动脱敏。

### PPT 与模型配置

- PPT 契约覆盖课程论文汇报、课堂展示、文献汇报、小组汇报、期末展示、研究计划、开题答辩、中期答辩、毕业答辩、组会、会议汇报、论文分享和投稿展示。
- PresentationProject、PresentationVersion、Slide 可绑定章节版本或材料快照；可用性不按学历门控。
- Provider、Model、ExecutionProfile 分别记录；标准/严格/自定义模式保持 2/3/4 模型上限。
- 凭据元数据区分 `PLATFORM_CREDENTIAL` 与 `USER_CREDENTIAL`，只接受掩码和服务端密文引用。API 对 `apiKey`、`api_key`、`plaintextKey` 等明文字段返回拒绝结果。
- 本阶段不测试真实连接，不调用供应商，也不保存真实密钥。

## 5. 所有者与资源隔离

所有项目域 Repository 先解析平台身份，再绑定 `owner_user_id` 和 `project_id`。请求级集成测试已验证：

- 匿名访问返回 401。
- 用户 A 可创建并读取自己的项目。
- 用户 B 看不到用户 A 的项目，显式访问其资源返回 404。
- 材料、任务、隐私、模型配置和 PPT 路由沿用同一所有者边界。

## 6. Migration 与本地数据库

数据库技术为 Cloudflare D1（SQLite）与 Drizzle ORM。Schema 位于 `db/schema.ts`；迁移为：

- `drizzle/0000_swift_blue_shield.sql`
- `drizzle/0001_vengeful_tigra.sql`
- `drizzle/0002_petite_sir_ram.sql`
- `drizzle/0003_condemned_magik.sql`
- `drizzle/0004_nervous_maddog.sql`

0000→0004 已同时在全新内存 SQLite 和新的持续存在 Miniflare/D1 文件中顺序执行，得到 58 张业务表。新增迁移只增加表、列和索引；自动化检查禁止 `DROP`、`DELETE`、`TRUNCATE`、危险 `ALTER ... DROP/RENAME`。

用户批准方案 A 后，旧 42 表/0 台账状态目录被完整移动到 `E:\论文系统\local-d1-archives\20260728-102348-I-015-9391D72F`。归档包含 SQLite、WAL/SHM、元数据、配置快照和清单；主库 SHA-256 归档前后均为 `9391D72F0987F2B3080152582D41DA898214FCEF35250F547A4F4282CEC15CDD`，只读重开确认 42 张业务表和可重建 Mock 数据仍可访问。

当前开发库为 `site\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`。标准命令 `wrangler d1 migrations apply site-creator-d1 --local --config wrangler.m3-local.jsonc` 记录 0000→0004 共 5 条台账；再次 list/apply 均报告无待执行迁移。`scripts/m4-migration-preflight.mjs` 和只读检查确认 58 张业务表、无缺表、无多余业务表、无列漂移，AI Task、审阅、隐私、PPT、Provider/Model/ExecutionProfile 表与新增列均存在。

回滚不依赖删除：停止项目服务，将当前 `.wrangler` D1 状态目录移出，再把已校验归档目录恢复到原位置。生产数据库和真实数据始终未接触。

## 7. 自动化检查

| 检查 | 结果 |
|---|---|
| M4 契约、Repository、隐私、PPT、模型与迁移测试 | 30/30 通过 |
| M4 请求级 API/隔离集成测试 | 2/2 通过 |
| 既有 M2/M3/V0.4.2/V0.4.3 回归测试 | 25/25 通过 |
| 持久化本地 D1 运行时与重启验收 | 通过；唯一标记 `I015_PERSISTENCE_20260728_1052` |
| 持久化库只读结构检查 | 5 条迁移台账、58 张业务表、1 个伪匿名映射引用 |
| TypeScript `tsc --noEmit` | 通过 |
| 全仓 ESLint（排除生成目录） | 通过 |
| `git diff --check` | 通过 |
| M4 功能开关开启的 Vinext build | 通过，7 个 M4 API 路由进入构建 |

请求级 API 集成测试继续使用全新内存 SQLite 和构建后的 Worker；M4-H1 另以真实 Vinext/Miniflare 本地文件 D1 完成运行时写入和重启复查。验收标记包含 2 个诊断版本、2 个父子任务、1 份 ReviewReport/ReviewIssue、用户决定与版本采用、6 种处理副本、3 条外传计划、1 个 ExecutionProfile、13 种 PresentationProject 和 PresentationVersion/Slide。匿名请求返回 401，另一用户列表无项目且越权材料请求返回 404。重启服务器 stderr 为空；两次准确记录的进程树均已停止，端口 3000 已释放。全程未调用外部服务。

## 8. 截图索引

M4 后端增量没有新增页面。M4 期间已经完成的编辑器响应式修复截图继续作为 M2/M3 前端未被推倒的视觉证据：

1. `docs/reviews/M4/editor-toolbar/desktop-1440x900.png`
2. `docs/reviews/M4/editor-toolbar/medium-1280x800.png`
3. `docs/reviews/M4/editor-toolbar/mobile-390x844.png`
4. `docs/reviews/M4/compact-sidebar-controls/desktop-1440x900.png`
5. `docs/reviews/M4/compact-sidebar-controls/compact-768x1024.png`
6. `docs/reviews/M4/compact-sidebar-controls/mobile-390x844.png`

## 9. 已知问题与未实现内容

- 旧 D1 归档仍保留作为回滚点，不会被 Miniflare 自动复用，也不进入 Git。
- 两处 M4 开始前已有的 UI 样式修改仍在工作区，属于独立 UI 批次，未纳入 M4-H1。
- 浏览器视觉仍沿用已审核的 M2/M3 页面与本目录 6 张截图；B1—B7 没有新增业务页面。
- 材料只登记元数据，没有对象存储和真实解析。
- 凭据只保存安全元数据契约，没有真实 Key、加密实现、连接测试或供应商路由。
- 隐私能力只记录策略、处理副本和保真结果，没有真实自动脱敏。
- PPT 只保存项目、版本、幻灯片及来源关系，不生成 PPTX。
- AI Task、审阅和验证只具备持久化与状态机，不调用真实模型。

## 10. 审核事项

请审核：

1. 五种项目起点和三个最低问题的数据契约。
2. 渐进式诊断字段状态、来源、版本与任务级就绪。
3. AI Task、独立审阅、用户决定和采用版本关系。
4. 隐私分类、六种模式与分析保真阻断边界。
5. 13 种 PPT 场景和来源快照关系。
6. BYOK 只保存元数据且拒绝明文 Key 的范围。
7. I-015 已按用户批准的方案 A 解除；审核归档、回滚和持久化运行时证据。

M4 最终结论为 `M4_PASS`。当前仍停留在 M4 审核门；M4 代码、迁移文件、API、Repository、本地数据库基线与测试均已通过，I-015/R-023 已解除。尚未进入 M5，等待用户审核。
