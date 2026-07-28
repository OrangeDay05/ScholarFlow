# 工作分解结构（WBS）

| Task ID | 里程碑 | 任务 | 负责人 | 目录所有权 | 前置依赖 | 输入 | 输出 | 验收标准 | 状态 | 风险 | 实际完成情况 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M0-A | M0 | 需求与范围分析 | m0_scope | `docs/product-scope.md`、`docs/acceptance-matrix.md` | 无 | V0.3、Skill 说明 | 范围与验收映射 | 排除项和六 Skill 映射完整 | DONE | 范围误扩张 | 已完成并只读 QA |
| M0-B | M0 | 现有工程审计 | m0_repo_audit / Root Agent | `docs/repository-audit.md` | 无 | `site/`、`web/` | 工程选择建议 | 唯一活动工程证据充分 | DONE | 双工程误维护 | 已冻结 `site/` |
| M0-C | M0 | UX 与信息架构 | m0_ux_map | `docs/product-ui-map.md` | 无 | 需求、现有页面 | IA、路由、状态与截图清单 | 覆盖六个 M1 页面 | DONE | 页面边界不清 | 已完成并只读 QA |
| M0-D | M0 | 前端 Mock 契约 | Root Agent | `docs/frontend-mock-contract.md` | 无 | 需求、Skill 契约 | 类型、状态、Adapter 边界 | 不提前设计正式数据库 | DONE | Mock 被误认真实 | 已完成 |
| M0-I | M0 | M0 集成与基线 | Root Agent | `docs/`、`AGENTS.md` | M0-A/B/C/D | 四份分析 | 管理体系与基线 commit | Git 可回退、活动工程唯一 | DONE | 根 Git 无效 | 基线 `8040888` |
| M1-0 | M1 | 设计 Token 与共享边界 | Root Agent | 共享组件、类型、全局样式 | M0-I | M0 基线 | 设计与组件契约 | 子任务无共享文件冲突 | DONE | 现有单页耦合 | 共享边界已冻结 |
| M1-1 | M1 | 全局框架与设计系统 | Root Agent | 共享布局与全局样式 | M1-0 | 视觉基线 | 登录后框架与状态组件 | 桌面/窄屏可用 | DONE | 样式冲突 | 已完成 |
| M1-2 | M1 | 认证与项目首页骨架 | m1_auth_projects | 独立路由目录 | M1-0 | Mock 契约 | 登录、注册、项目列表 | 页面真实渲染 | DONE | 误做真实认证 | 已完成，纯 Mock |
| M1-3 | M1 | 创建与诊断骨架 | m1_creation_diagnosis | 独立路由目录 | M1-0 | 五入口契约 | 创建选择、Idea、诊断卡 | 确认前后可区分 | DONE | 误做真实解析 | 已完成，纯 Mock |
| M1-4 | M1 | 三栏编辑器骨架 | m1_editor | 独立路由目录 | M1-0 | 六 Skill 契约 | 编辑器页面 | 未确认诊断阻断明显 | DONE | 暴露内部 Skill | 已完成 |
| M1-QA | M1 | 集成、渲染和审核包 | Root Agent | `docs/reviews/M1/` | M1-1/2/3/4 | 所有页面 | 截图、测试、review | 六页+桌面/窄屏+点击验证 | DONE | 浏览器/服务日志错误 | 14 张审核图；浏览器与日志通过 |
| M2-1 | M2 | 完整项目创建流程 | m2_creation_flow | `app/projects/new/**` | M1 批准、M2 状态契约 | 五种入口、文件状态 | 分步表单、队列、草稿和跳转 | 五种入口均可演示创建 | DONE | 误做真实上传 | 五入口、格式范围、五种队列状态和创建跳转已通过浏览器检查 |
| M2-2 | M2 | 诊断卡与目录流程 | m2_diagnosis_outline | `diagnosis/**`、`outline/**` | M2 状态契约 | 诊断和目录状态 | 编辑、确认、重开、排序 | 确认门和更新语义正确 | DONE | 确认后覆盖旧版本 | 已确认 v1 保留；修改进入待重新确认；目录可生成、改名、排序与确认 |
| M2-3 | M2 | 编辑器、版本与证据 | m2_editor_versions | `editor/**` | M2 状态契约 | 章节、Skill、材料、任务 | 新版本、比较、恢复、证据 | 六 Skill 与证据状态可演示 | DONE | Mock 被误认真实 | AI 工作台动态启用六项 Skill；主备模型、版本、三栏独立滚动、章节/证据双向定位与警告已验证 |
| M2-4 | M2 | 导出与管理员原型 | Root Agent | `export/**`、`admin/**` | M2 状态契约 | 导出检查、管理四模块 | DOCX 预检和管理台 | 无运营范围扩张 | DONE | 管理台范围失控 | DOCX-only 预检与用户/项目文件/AI 任务/模型 Skill 四页已完成 |
| M2-QA | M2 | 连续流程和审核包 | Root Agent | `docs/reviews/M2/**` | M2-1/2/3/4 | 完整 Mock 原型 | 点击证据、截图和 review | 连续闭环通过且停止 M3 | DONE | 路由或状态断链 | 32 张桌面/窄屏截图与正式审核报告；全仓及变更文件 Lint、构建、自动化测试、桌面/窄屏浏览器、控制台和干净服务日志通过 |
| V042-1 | V0.4.2 Mock | 增量导航与功能开关 | Root Agent | `app/components/**`、`app/lib/v042-features.ts`、编辑器右栏增量入口 | M2 用户批准 | 用户九项增量要求 | 可关闭的新导航和入口 | 关闭后恢复完整 M2 体验 | DONE | 新入口污染 M2 | 主导航只增加一个聚合入口；编辑器右栏默认收起；关闭态 M2 原路由 200、新路由 404 |
| V042-2 | V0.4.2 Mock | 六个独立业务页面 | Root Agent | `app/extensions/**`、`app/lib/v042-mock.ts` | V042-1 | 六项业务名称 | 总览和六个独立路由 | 页面可渲染、可点击且持续标 Mock | DONE | 将 Mock 误作真实服务 | Idea、外部文献、高级审稿、投稿返修、科研图件和 PPT 已独立页面化 |
| V042-QA | V0.4.2 Mock | 增量审核包 | Root Agent | `docs/reviews/V0.4.2/**` | V042-1/2 | 增量原型 | 截图、测试、review | 开关、M2 回归、桌面/窄屏和日志通过 | DONE | 基线回归或范围扩张 | 9 张截图；6/6 自动化测试；开启/关闭态构建、浏览器与服务日志检查通过 |
| M3-1 | M3 | 数据模型与首次迁移 | Root Agent | `db/schema.ts`、`drizzle/**`、`.openai/hosting.json` | M2 与 V0.4.2 用户批准 | 需求范围与 M2 契约 | 37 表 Schema、迁移和 D1 绑定 | 迁移可在空本地 D1 执行；R2 不提前启用 | DONE | 数据模型过度承诺真实能力 | 已生成并执行首次迁移；D1 绑定为 `DB`，R2 为 `null` |
| M3-2 | M3 | 身份、隔离与 API 契约 | Root Agent | `app/api/m3/**`、`db/repositories/**`、`app/lib/m3-*.ts` | M3-1 | 平台身份头、项目所有权规则 | 项目/工作区/诊断/提纲/章节版本 API | 匿名拒绝、跨用户 404、写入均按 owner 限定 | DONE | 越权读取或本地演示身份误启用 | 匿名 401、平台头 200、双用户列表隔离和跨用户 404 已通过 |
| M3-3 | M3 | 可关闭的前端基础数据 Adapter | Root Agent | `MockWorkspaceContext.tsx`、诊断/目录/编辑器页面 | M3-2 | M2 前端状态 | D1 基础数据水合与版本追加 | 默认关闭保持 M2；开启后只替换基础数据 | DONE | 覆盖 M2 或将 Mock 伪装为真实 AI | 项目、诊断、提纲和章节版本为 D1；材料解析、AI、证据和 DOCX 仍明确 Mock |
| M3-QA | M3 | 验证、审计与审核包 | Root Agent | `tests/**`、`docs/audits/**`、`docs/reviews/M3/**` | M3-1/2/3 | 代码与本地 D1 | 测试结果、审计和审核报告 | 迁移、重启持久化、隔离、类型、Lint、构建通过并停在 M3 | DONE | 浏览器环境策略阻断部分视觉复测 | API/CLI 与自动化检查完成；浏览器策略限制如实记录，未绕过 |
| V043-1 | V0.4.3 Mock | 双模型复核契约与功能开关 | Root Agent | `app/lib/dual-model-review-*.ts` | M2 基线、M3 提交 | 用户双模型规则 | 三种模式、五种结论、模型/问题/流程 Mock 契约 | 关闭开关恢复 M2；无 Schema、迁移或真实模型调用 | DONE | Mock 被误认真实服务 | 模式、结论、模型记录、证据边界和无循环规则已固化 |
| V043-2 | V0.4.3 Mock | 配置、审阅、修订与验证 UI | Root Agent | `editor/**`、`MockWorkspaceContext.tsx` | V043-1 | 双模型契约 | AI 复核标签页和追加版本流程 | 可演示 V4→R4→V5→F5，审阅不覆盖正文，用户选择问题 | DONE | 自动覆盖正文或无限循环 | 5 类用户决定、REVIEW_FAILED 保留原版和一次修订/验证已实现 |
| V043-QA | V0.4.3 Mock | 自动化、浏览器与审核包 | Root Agent | `tests/**`、`docs/reviews/V0.4.3-dual-model-review/**` | V043-1/2 | 完整 Mock 前端 | 测试、截图和 review | 桌面/390px、控制台、构建和专项测试通过并停在审核门 | DONE | M2 响应式回归 | 5 张截图、严格复核点击链路和审核报告已完成 |
| M3-PD-1 | M3 增量 Mock | 渐进式诊断契约与入口 | Root Agent | `app/lib/progressive-diagnosis-*.ts`、`diagnosis/**` | M2 基线 | 渐进式诊断需求 | 四入口、问题树、字段/来源、就绪、版本契约 | 单问题引导且 AI 推测不冒充确认事实 | DONE | 诊断不完整锁死项目 | 三个最低问题、停止规则和任务级就绪已实现 |
| M3-PD-QA | M3 增量 Mock | 渐进式诊断专项验证 | Root Agent | `tests/progressive-diagnosis-mock.test.mjs` | M3-PD-1 | 前端 Mock | 契约与路由测试 | 5 项专项测试和 SSR 通过 | DONE | 状态转换遗漏 | 5/5 通过 |
| M3-MO-1 | M3 增量 Mock | 多模型编排与凭据契约 | Root Agent | `app/lib/model-orchestration-*.ts` | V043-1 | 多模型/API Key 需求 | 角色、模式、凭据、预算、冲突和失败契约 | 上限明确；真实 Key 不进入前端状态或日志 | DONE | 无限调用或 Key 泄漏 | 五角色、三模式、两凭据类型和八失败状态已固化 |
| M3-MO-2 | M3 增量 Mock | 模型与 API 配置界面 | Root Agent | `app/settings/models/**`、管理员和编辑器入口 | M3-MO-1 | 编排契约 | 配置、披露、冲突和失败 Mock | 页面可渲染；真实 Key 输入禁用；无供应商调用 | DONE | Mock 被误认真实连接 | 设置页、管理入口和编辑器披露已完成 |
| M3-MO-QA | M3 增量 Mock | 多模型专项验证与审核包 | Root Agent | `tests/model-orchestration-mock.test.mjs`、`docs/reviews/M3-incremental-mocks/**` | M3-PD-QA/M3-MO-2 | 完整增量 Mock | 测试、构建、HTTP 与 review | 25 项全量测试、构建和关键路由 200 | DONE | 未经批准进入真实实现 | 审核报告已创建，停在审核门 |
| M4-B1 | M4 | 需求与共享契约冻结 | Root Agent | `AGENTS.md`、`docs/**` | M3 完成、V0.5.1 | 需求基线与现状审计 | 有效基线、差距矩阵、批次和迁移策略 | 当前阶段、禁止项、迁移台账差异和批次停止条件一致 | DONE | 旧文档与新基线冲突 | `3c71f02` |
| M4-B2 | M4 | 账号、项目、材料与五起点持久化 | Root Agent | `db/**`、`drizzle/**`、`app/api/m4/**`、`tests/**` | M4-B1 | 现有 M3 所有者隔离基础 | 增量实体、Repository 和 API | 五起点可持久化；匿名拒绝；跨用户不可见 | DONE | 身份边界或旧数据回填错误 | `716651a` |
| M4-B3 | M4 | 渐进式诊断、版本和任务就绪 | Root Agent | `db/**`、`app/api/m4/**`、`app/lib/m4-*.ts`、`tests/**` | M4-B2 | 渐进式诊断 Mock 契约 | 完整状态、来源、版本、审计和就绪 API | AI 推测不冒充确认；历史不覆盖；任务级门控 | DONE | 当前 migration 与本地台账漂移 | `fe36968` |
| M4-B4 | M4 | AI Task、审阅与采用版本关系 | Root Agent | `db/**`、`app/api/m4/**`、`tests/**` | M4-B2 | M3 双模型 Mock 契约 | 状态机、父子任务、报告、问题和用户决定 | 审阅不改正文；修订追加；部分失败不标通过 | DONE | 状态转换或幂等遗漏 | `aa1bc2e` |
| M4-B5 | M4 | 隐私处理与分析保真 | Root Agent | `db/**`、`app/api/m4/**`、`tests/**` | M4-B2 | V0.5.1 隐私分类 | 画像、副本、映射、外传和保真记录 | 六模式可区分；禁止破坏必要变量、样本和时序 | DONE | 处理副本破坏研究有效性 | `841f304` |
| M4-B6 | M4 | PPT 场景与模型/BYOK 元数据 | Root Agent | `db/**`、`app/api/m4/**`、`tests/**` | M4-B2 | PPT 与编排 Mock 契约 | 13 场景、版本/幻灯片来源；模型和凭据元数据 | PPT 不按学历门控；不接收明文 Key | DONE | 场景遗漏或密钥泄漏 | `3b472a5` |
| M4-B7 | M4 | 权限、迁移、测试与审核收尾 | Root Agent | `tests/**`、`scripts/**`、`docs/reviews/M4/**`、项目管理文档 | M4-B3/B4/B5/B6 | 全部 M4 增量 | 隔离、幂等、只读预检、审核包和提交 | 全量检查通过；旧本地库漂移明确阻断盲目迁移；停在 M4 审核门 | DONE | 本地数据与迁移状态不一致 | API 隔离通过；新库迁移链通过；旧库保持只读并列为 I-015 |
| M4-H1 | M4 | I-015 本地 D1 基线协调 | Root Agent | `.wrangler` 本地状态（不提交）、`scripts/**`、`docs/**` | M4-B7、用户批准方案 A | 可重建旧 Mock 数据与已验证迁移链 | 旧库归档、新持久化 D1、运行时/重启验收脚本、审核记录 | 5 条迁移台账、58 表、重启后唯一标记存在、匿名 401、跨用户 404、归档可恢复 | DONE | 误用旧库、误删数据或误提交本地状态 | I-015/R-023 已关闭；M4_PASS；仍停在 M4 审核门 |
| M4-H2 | M4 | CORE-01 真实认证与项目门禁 | Root Agent | `app/api/auth/**`、`app/lib/auth.ts`、项目 API/Repository、`drizzle/0005*`、测试与审核文档 | M4-H1 | `users`、`sessions`、`login_records` | 注册、登录、Session、退出、游客门禁、Session 所有者隔离 | 邮箱/手机号唯一；密码安全哈希；退出/过期/撤销失效；匿名 401；跨用户 404；无身份 Header 后门 | DONE | Cookie、运行时兼容、旧 Mock 身份残留 | CORE-01 已通过；M4_PASS；仍停在 M4 审核门 |
| M5-B1 | M5 | 真实执行共享契约 | Root Agent | `app/lib/m5-*.ts`、`tests/m5-*.test.mjs`、`docs/**` | M4-H2、用户批准进入 M5 | M4 Task/Model/Privacy 契约与 Skill 集成说明 | 六 Skill 上下文/结果、Provider Adapter、凭据解析、预算、超时和恢复边界 | 六 Skill 不增不减；2/3/4 模型与 2/4/5 调用上限；章节诊断门；无明文秘密 | DONE | 把接口误报为真实调用 | 3/3 专项、TypeScript、ESLint 和回归通过；未调用供应商或接收真实 Key |
| M5-B2A | M5 | 对话优先 AI 工作台与 Conversation Agent 基础 | Root Agent | `app/lib/m5-conversation-agent.ts`、编辑器 AI 工作台、测试与文档 | M5-B1、新 M5 路线 | 六 Skill 唯一数据源、M5 执行契约 | 双页签、默认 Prompt、ToolIntent、摘要、Action Proposal、用户确认门 | 原 Skill 任务保留；确认前不执行；摘要不冒充事实；不调用 Provider | DONE | 对话绕过任务门、摘要误认事实 | 审核反馈修正后 94 项全量测试（88 通过、6 个环境型跳过）、类型、全仓 Lint 和 build 通过；中栏空提纲回退与 Skill→Prompt 跳转有专项契约覆盖 |
| M5-B2B | M5 | 长期会话、消息与摘要持久化 | Root Agent | `app/lib/m5-conversation-agent.ts`、`app/api/m5/**`、`db/**`、`drizzle/0007*`、测试与文档 | M5-B2A | 真实 Session、D1、六 Skill 契约 | 会话/消息/派生摘要 Repository/API、幂等、归档与所有者隔离 | 跨用户 404；摘要保留来源且不冒充用户事实；归档后不可写；迁移增量可回放 | DONE | 摘要越权引用、重复消息、归档后写入 | 3/3 专项行为测试与 0000→0007 全新迁移链通过；0007 仅生成未执行；未调用 Provider |
| M5-B2C | M5 | 操作提案、用户决定与恢复状态持久化 | Root Agent | `app/lib/m5-conversation-agent.ts`、`app/api/m5/**`、`db/**`、`drizzle/0008*`、测试与文档 | M5-B2B | 会话、材料授权、六 Skill 契约 | ToolIntent、Action Proposal、一次性决定、恢复状态与查询 API | 未确认保持 WAITING_FOR_USER；确认只到 READY_TO_QUEUE；拒绝 TERMINAL；不创建 AI Task；跨用户 404 | DONE | 确认门被绕过、决定被覆盖、材料越权 | 3/3 专项行为测试与 0000→0008 全新迁移链通过；0008 仅生成未执行；未调用 Provider |
| M5-B2D | M5 | 会话压缩、恢复与权限回归 | Root Agent | `app/lib/m5-conversation-agent.ts`、`app/api/m5/**`、`db/repositories/m5-*.ts`、测试与文档 | M5-B2C | 持久会话、派生摘要、提案恢复状态 | 有界分页、追加式压缩计划、连续来源校验、恢复快照与幂等重试规则 | 24 条阈值；保留最近 8 条；单次摘要最多 16 条；不删除原消息；不直接执行提案 | DONE | 上下文无限增长、摘要跳过消息、恢复绕过确认门 | B2 专项 14/14、全量回归、类型、Lint 与 build 通过；无新表/迁移；I-017 仍留待真实 Runner |
| M5-B3A | M5 | Storage Adapter 与上传安全基础 | Root Agent | `app/lib/storage/**`、`app/api/m5/**`、`db/**`、`drizzle/0006*`、上传页与测试 | M5-B1、用户批准原 B2A | 真实 Session、D1、本地 Miniflare R2 | 不可覆盖原文件、文件安全探测、对象状态、审计与失败补偿 | 25 MB 硬限制；跨用户 404；幂等；重启后 D1/R2 存在；只到 AWAITING_PARSE | DONE | 文件伪装、孤立对象、误报已解析 | 原提交 `f063cad`；25/25 专项、真实浏览器上传、类型/Lint/build/回归通过；仅重分类，不重做 |
