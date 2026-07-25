# M2 可点击原型审核报告

审核日期：2026-07-26
活动工程：`E:\论文系统\site`
分支：`m2/clickable-prototype`
阶段状态：`WAITING_FOR_REVIEW`

## 1. M2 目标

M2 的目标是在不接入数据库、真实文件解析、真实 AI、真实 DOCX 导出或生产部署的前提下，完成可点击的端到端 Mock 原型，验证五种项目创建方式、诊断卡、目录、编辑器、版本、证据、DOCX 预检和简易管理员页面的产品流程与交互结构。

## 2. 已完成页面和功能

- 五种项目创建入口及分步表单。
- Mock 文件队列：排队、解析中、成功、失败、取消、重试和重新排队。
- 诊断卡编辑、确认、确认快照、确认后修改和重新确认。
- 根据诊断卡生成目录、改名、排序和确认。
- AI 工作台六项产品级 Skill，按项目状态动态启用。
- 显式材料授权、Mock 任务状态、主模型失败和用户确认后的备用模型重试。
- 章节版本比较、恢复为新版本，不覆盖原版本。
- 直接支持、间接支持、无法确认三类证据卡及风险提示。
- 仅提供 DOCX 的导出预检页面。
- 用户、项目与文件、AI 任务、模型与 Skill 四个简易管理员页面。
- 编辑器三栏独立滚动、连续纸张分页、章节双向定位、证据双向定位、左右栏折叠、专注写作和窄屏抽屉。

## 3. 页面路由

| 页面 | 路由 |
|---|---|
| 首页跳转 | `/` |
| 登录 | `/login` |
| 注册 | `/register` |
| 项目列表 | `/projects` |
| 创建方式 | `/projects/new` |
| Idea 创建 | `/projects/new/idea` |
| 导入已有初稿 | `/projects/new/existing-draft` |
| 上传论文要求 | `/projects/new/requirements` |
| 导入文献与范文 | `/projects/new/literature` |
| 上传数据与研究材料 | `/projects/new/data` |
| 诊断卡 | `/projects/:projectId/diagnosis` |
| 论文目录 | `/projects/:projectId/outline` |
| 论文编辑器 | `/projects/:projectId/editor` |
| DOCX 导出预检 | `/projects/:projectId/export` |
| 管理台入口 | `/admin` |
| 用户管理 | `/admin/users` |
| 项目与文件 | `/admin/projects-files` |
| AI 任务 | `/admin/tasks` |
| 模型与 Skill | `/admin/models-skills` |

## 4. 32 张截图索引

截图根目录：`docs/reviews/M2/screenshots/`

| 序号 | 文件 | 验证内容 |
|---:|---|---|
| 01 | `01-login-desktop.png` | 桌面登录 |
| 02 | `02-projects-desktop.png` | 桌面项目列表 |
| 03 | `03-create-five-modes.png` | 五种创建入口 |
| 04 | `04-idea-step-one.png` | Idea 第一步 |
| 05 | `05-file-queue-states.png` | 文件队列状态 |
| 06 | `06-create-confirm.png` | 创建确认 |
| 07 | `07-diagnosis-draft.png` | 诊断卡草稿 |
| 08 | `08-outline-ready.png` | 目录待确认 |
| 09 | `09-diagnosis-updated-reconfirm.png` | 修改后重新确认 |
| 10 | `10-outline-edit-reorder.png` | 目录编辑与排序 |
| 11 | `11-editor-ready.png` | 编辑器就绪 |
| 12 | `12-editor-task-success.png` | Mock 任务成功 |
| 13 | `13-version-history-restore.png` | 版本历史与恢复 |
| 14 | `14-evidence-unverified.png` | 无法确认的证据 |
| 15 | `15-export-preflight.png` | DOCX 导出预检 |
| 16 | `16-admin-users.png` | 管理员用户页 |
| 17 | `17-admin-tasks.png` | 管理员任务页 |
| 18 | `18-upload-queue-actions.png` | 上传队列操作 |
| 19 | `19-ai-workspace-dynamic-blocked.png` | AI 工作台动态阻断 |
| 20 | `20-ai-workspace-ready.png` | AI 工作台准备状态 |
| 21 | `21-editor-middle-scroll.png` | 中栏独立滚动 |
| 22 | `22-editor-right-scroll-tabs.png` | 右栏独立滚动与标签页 |
| 23 | `23-editor-chapter-position.png` | 章节定位与左栏高亮 |
| 24 | `24-editor-evidence-linkage.png` | 证据双向联动 |
| 25 | `25-editor-focus-mode.png` | 专注写作 |
| 26 | `mobile-ai-workspace-preparation.png` | 窄屏任务准备 |
| 27 | `mobile-ai-workspace-ready.png` | 窄屏工作台就绪 |
| 28 | `mobile-create.png` | 窄屏创建页 |
| 29 | `mobile-editor-drawers.png` | 窄屏目录和 AI 抽屉 |
| 30 | `mobile-editor.png` | 窄屏编辑器 |
| 31 | `mobile-login.png` | 窄屏登录 |
| 32 | `mobile-projects.png` | 窄屏项目列表 |

## 5. 核心演示流程

1. 从项目列表进入“新建项目”，检查五种创建方式。
2. 任选一种方式填写分步表单，演示保存草稿、返回修改、Mock 文件队列和确认创建。
3. 在诊断卡中编辑并确认；再次修改时保留已确认快照并进入待重新确认。
4. 生成目录，修改章节名和顺序，确认后进入编辑器。
5. 在 AI 工作台检查六项 Skill 的动态启用状态、材料授权和任务准备状态。
6. 演示 Mock 任务、主模型失败、用户确认后使用 DeepSeek 备用模型、版本比较和恢复为新版本。
7. 点击正文证据标记定位右栏证据卡，再点击证据卡返回正文论断。
8. 打开 DOCX 导出预检，确认只有 DOCX 入口。
9. 检查四个管理员页面，确认没有扩展到支付、会员或复杂运营模块。

## 6. 浏览器检查结果

本轮使用固定端口 3000 的干净开发服务器复测，Node PID 为 `28152`；复测后已停止该 PID 及直属 `workerd` 子进程 `37600`。

- 1440×900：Body `scrollTop=0`，页面高度等于视口高度，无横向溢出。
- 中栏：可滚动高度约 5360px；右栏：可滚动高度约 1166px。
- 滚动右栏时，中栏位置保持不变；滚动中栏时，右栏位置保持不变。
- 中栏滚动后左栏自动高亮“研究方法”，URL 同步为 `section=method`。
- 点击“结果与讨论”后，中栏定位到该纸张顶部约 66px，左栏同步高亮，URL 为 `section=results`。
- 点击正文“证据 01”后，右栏切换到“引用证据”并高亮直接证据卡。
- 点击间接证据卡后，中栏定位并高亮对应论断。
- 390×844：Body 高度等于视口，无横向溢出；桌面左右栏隐藏；目录和 AI 工作台使用抽屉；中栏保持独立滚动。
- 浏览器控制台 warning/error：0。
- 服务端 stderr：空。
- 服务端日志只包含正常启动和编辑器页面 200 请求。
- 未出现新的 `multiple renderers concurrently rendering` 警告。
- 复测后 3000、3001、9229、9230 均无当前项目监听，未遗留 `vinext dev`。

## 7. 构建和测试结果

- `git diff --check`：通过。
- 变更相关 TypeScript/JavaScript 文件 ESLint：通过。
- 全仓 ESLint：在 180 秒上限内通过。
- `node --test tests/rendered-html.test.mjs`：5 项通过，0 失败。
- `vinext build`：通过，19 个路由完成构建。

## 8. Mock 与真实能力说明

当前所有项目数据、上传状态、材料解析、诊断、AI 任务、版本、证据和管理员数据均为前端内存 Mock。

当前没有：

- 数据库持久化或正式 Schema；
- 真实用户认证和权限；
- 真实文件上传、解析或对象存储；
- 真实 ChatGPT、DeepSeek 或其他模型调用；
- 真实产品 Skill 编排；
- 真实外部搜索、文献数据库或相似度检测；
- 真实 DOCX 文件生成和下载；
- 真实短信、邮件、支付或管理员操作；
- 生产部署。

## 9. 已知问题

- ESLint 冷启动曾出现耗时较长的情况；本轮 17 个变更文件检查和全仓限时检查均已通过。
- 当前页面状态保存在浏览器内存中，刷新后不具备真实业务持久化语义。
- 管理员页面仅用于验证信息架构和交互，不具备权限隔离或真实操作能力。
- 证据卡中的文件、页码、段落和引文均为演示数据，不代表真实解析结果。

## 10. M2 未实现内容

- 数据库、迁移、服务端业务 API 和用户数据隔离。
- 真实认证、短信、邮件、支付、对象存储和供应商集成。
- 真实上传与 PDF、DOCX、XLSX、CSV、TXT、图片、BibTeX、RIS 解析。
- 真实 AI 模型调用、主备模型路由和产品 Skill 执行。
- 真实版本持久化、证据绑定和外部来源核验。
- 真实 DOCX 生成与下载。
- 生产级管理员权限、日志和审计。
- 生产部署。

## 11. 当前未进入 M3

当前停留在 M2 审核门。未处理 V0.4 或 V0.4.1 增量需求，未修改数据库 Schema，未执行迁移，未接入新 Skill，未创建 M3 分支，也未部署。

## 12. 等待用户审核的事项

- 五种创建流程是否符合首版使用习惯。
- 诊断卡确认、修改和重新确认语义是否清楚。
- 目录生成、编辑、排序和确认流程是否符合预期。
- 编辑器三栏独立滚动、章节定位、证据联动、标签页、折叠和专注模式是否通过。
- AI 工作台六项 Skill 的分组、动态状态和任务准备说明是否清楚。
- DOCX-only 预检和四页简易管理台范围是否合适。
- 用户确认 M2 后，才允许另行决定是否进入 M3。

当前停留在 M2，等待用户审核；未启动 M3。
