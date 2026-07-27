# M3 数据模型、接口契约与基础持久化审核报告

审核状态：WAITING_FOR_REVIEW

日期：2026-07-27

活动工程：`E:\论文系统\site`

分支：`m3/data-contract-persistence`

## 1. M3 目标

在不重写 M2 前端、不接真实 AI/文件服务、不部署的前提下，建立可迁移的数据模型、所有者隔离的基础接口、追加式版本记录和可关闭的前端 D1 Adapter。

## 2. 基线保护

- M2 提交 `5234134` 保持不变，继续作为核心写作工作台和视觉基线。
- V0.4.2 增量 Mock 已获用户批准，新增页面仍由原功能开关控制。
- M3 没有重写三栏编辑器，只在已有 Context 与少量状态标签处接入基础数据。
- `NEXT_PUBLIC_M3_PERSISTENCE_ENABLED` 不是 `true` 时，完整恢复 M2 Mock 数据路径。

## 3. Schema 与资源

首次迁移包含 37 张表：

- 身份：`users`、`login_records`、`sessions`
- 项目与要求：`projects`、`project_requirements`、`diagnosis_cards`
- 材料与文献：`materials`、`material_parse_results`、`literature_records`
- 提纲与版本：`outlines`、`sections`、`section_versions`
- Skill 与任务：`skills`、`skill_versions`、`ai_tasks`、`ai_task_results`
- 引用、证据、导出与审计：`citations`、`claims`、`evidence_bindings`、`export_records`、`admin_audit_logs`
- Idea：`idea_exploration_sessions`、`idea_candidates`
- 外部文献：`external_search_runs`、`literature_candidates`
- 高级审稿：`review_runs`、`review_findings`
- 投稿返修：`submission_preparations`、`reviewer_comments`、`revision_tasks`、`response_drafts`
- 科研图件：`figure_projects`、`figure_versions`、`figure_assets`
- PPT：`presentation_projects`、`presentation_versions`、`slides`

没有 `project_members` 或共享账号数据结构。导出记录格式固定为 `docx`。Sites 配置只声明 D1 `DB`，R2 保持 `null`。

## 4. API 路由

| 路由 | 方法 | M3 能力 |
|---|---|---|
| `/api/m3/projects` | GET | 列出当前用户项目 |
| `/api/m3/projects` | POST | 创建项目、初始诊断、提纲与默认章节 |
| `/api/m3/projects/:projectId/workspace` | GET | 读取诊断、提纲、章节版本和材料元数据 |
| `/api/m3/projects/:projectId/diagnosis` | POST | 追加诊断版本并可确认 |
| `/api/m3/projects/:projectId/outline` | POST | 追加提纲与章节快照并可确认 |
| `/api/m3/projects/:projectId/sections/:sectionSlug/versions` | POST | 追加人工保存或恢复版本 |

## 5. 身份与数据隔离

- 生产路径读取平台认证头 `oai-authenticated-user-email`。
- 未认证且未显式打开本地演示身份时返回 401。
- 本地演示身份必须同时设置 `M3_ALLOW_LOCAL_DEMO_IDENTITY=true` 和邮箱。
- 项目域查询与写入同时绑定项目 ID 和 `owner_user_id`。
- 双用户复测结果：用户 A 项目不出现在用户 B 列表；用户 B 访问用户 A 项目返回 404。

## 6. 版本规则

- 诊断卡确认或修改创建新的 `diagnosis_cards` 版本。
- 提纲确认或修改创建新的 `outlines` 与章节快照。
- 人工保存创建新的 `section_versions`。
- 恢复旧版创建 `source=restore` 的新版本，并记录 `source_version_id`。
- Repository 不更新或删除历史 `section_versions`。

## 7. 前端 Adapter

开启 M3 持久化后，诊断、提纲和编辑器从 D1 工作区快照水合；诊断确认、提纲确认、人工保存和恢复写回 D1。页面会区分“D1 基础数据”和仍为 Mock 的能力。

项目列表、五种创建表单的全站 API 接线不属于本轮；材料解析、AI、证据和 DOCX 也没有被伪装成真实服务。

## 8. 验证结果

| 检查 | 结果 |
|---|---|
| Drizzle 迁移生成 | 通过；1 个首次迁移，37 表 |
| 本地 D1 迁移 | 通过；94 commands |
| API 创建/诊断/提纲/人工版本/恢复 | 通过 |
| 双用户隔离 | 通过；列表隔离，跨用户 404 |
| 匿名/平台身份 | 通过；401 / 200 |
| 重启持久化 | 通过；重启后项目 ID `4a5bde6e-69d8-4169-b85c-9eeaeaba3a8e` 仍可读取，来源为 `d1` |
| TypeScript | 通过；`tsc --noEmit --incremental false` |
| 变更文件 ESLint | 通过 |
| 全仓 ESLint | 通过 |
| 生产构建 | 通过；M3 API 路由进入构建清单 |
| 自动化测试 | 通过；9/9 |
| `git diff --check` | 通过 |

Node SSR 测试使用仅限测试进程的 `cloudflare:workers` 空 `env` shim；生产构建仍使用 Cloudflare 官方模块和真实 D1 绑定。

## 9. 浏览器检查

重启前，核心诊断页面已成功渲染，M2 页面结构保持正常；当时因为本地演示身份尚未注入 Worker，D1 请求返回 401 并安全回退到 Mock。

修正本地 Worker `vars` 并重启后，浏览器停在连接失败数据页，后续操作被浏览器 URL 安全策略阻断。本轮没有绕过或改用其他浏览器表面。API 已确认本地演示身份、D1 来源和持久化生效，但本报告不声称已在浏览器中看到重启后的 D1 标签。

新增 M3 截图：0。原 M2 的 32 张截图和 V0.4.2 的 9 张截图继续作为视觉基线证据。

## 10. 真实能力与 Mock

真实基础能力：

- D1 Schema 与迁移
- 平台身份头解析
- 项目所有者隔离
- 项目、诊断、提纲和章节版本基础 API
- 本地重启后持久化

仍为 Mock 或未实现：

- 登录注册后端和完整会话
- 文件上传、R2、Excel/CSV/TXT/图片/PDF/Word 解析
- ChatGPT/DeepSeek 调用和六 Skill 执行
- 外部文献搜索、审稿、返修、科研图件和 PPT 服务
- 真实引用证据核验
- 真实 DOCX 生成和下载
- 生产资源与部署

## 11. 已知问题

- 浏览器安全策略阻断了重启后的 D1 标签视觉复核；需在新的浏览器会话补看。
- `wrangler.m3-local.jsonc` 使用本地占位数据库 ID，不能作为生产资源配置。
- 项目列表和五种创建表单尚未全站接入 M3 API。
- 本地 PowerShell 对未指定 UTF-8 的中文 JSON 可能显示问号；API 契约和数据库行为不受影响，后续客户端接线统一使用 UTF-8。

## 12. M3 未实现内容

M4 业务后端、M5 文件/AI/Skill、M6 证据/DOCX、M7 管理闭环和 M8 部署均未启动。

## 13. 本地查看

默认 M2：

```powershell
cd E:\论文系统\site
.\node_modules\.bin\vinext.cmd dev --port 3000
```

显式启用本地 M3 基础数据：

```powershell
cd E:\论文系统\site
$env:NEXT_PUBLIC_M3_PERSISTENCE_ENABLED='true'
$env:NEXT_PUBLIC_M3_AUTO_SEED_DEMO='true'
$env:M3_ALLOW_LOCAL_DEMO_IDENTITY='true'
$env:M3_LOCAL_DEMO_USER_EMAIL='demo@scholarflow.local'
.\node_modules\.bin\vinext.cmd dev --port 3000
```

访问 `http://localhost:3000/projects/demo/diagnosis`。

## 14. 等待用户审核

请审核：

1. 37 表范围是否适合作为后续阶段基础。
2. 项目所有者隔离和平台身份头边界是否接受。
3. 诊断、提纲、人工保存与恢复的追加版本规则是否接受。
4. M3 前端 Adapter 只替换基础数据、其余继续 Mock 的边界是否接受。
5. 是否批准进入 M4。

当前停留在 M3 审核门，尚未进入 M4。
