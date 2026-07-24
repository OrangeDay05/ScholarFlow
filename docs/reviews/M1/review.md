# M1 阶段审核包

## 1. 当前里程碑

- 里程碑编号：M1
- 里程碑名称：视觉基线与六个核心页面骨架
- 当前状态：`WAITING_USER_REVIEW`
- 当前分支：`m1/visual-baseline`
- 审核提交：`21ed74a`
- 是否已停止后续工作：是。未启动 M2、后端、数据库、真实 AI 或生产部署。

## 2. 本阶段目标

把 M0 冻结的范围、路由和 Mock 契约变成真实可访问、可点击、可在桌面与窄屏渲染的前端页面。审核重点是产品形态、信息层级、五种创建入口、诊断卡确认门、三栏编辑器、六个产品级 Skill、状态语言与 Mock 真实性标识，不验证真实业务能力。

## 3. 已完成任务

| Task ID | 完成项 | 结果 |
|---|---|---|
| M1-0 | 设计 Token、共享组件和 Mock 数据边界 | 已完成 |
| M1-1 | 全局框架、品牌、导航和五类状态视觉 | 已完成 |
| M1-2 | 登录、注册和项目列表 | 已完成 |
| M1-3 | 五种创建方式、五个表单骨架和诊断卡 | 已完成 |
| M1-4 | 三栏编辑器、六个产品级 Skill 和写作阻断 | 已完成 |
| M1-QA | 构建、Lint、SSR 测试、浏览器点击、桌面/窄屏截图和日志检查 | 已完成 |

## 4. 子 Agent 执行情况

| Agent 名称 | 负责范围 | 修改文件 | 结果 | 风险 |
|---|---|---|---|---|
| `m1_auth_projects` | 登录、注册、项目列表 | `app/login/**`、`app/register/**`、`app/projects/page.tsx`、`Projects.module.css` | 页面和响应式样式完成 | 仅为 Mock，不保存账号或项目 |
| `m1_creation_diagnosis` | 创建方式、五个表单、诊断卡 | `app/projects/new/**`、`app/projects/[projectId]/diagnosis/**` | 五入口、静态上传队列、草稿/已确认状态完成 | 不执行真实上传、解析或诊断 |
| `m1_editor` | 三栏编辑器 | `app/projects/[projectId]/editor/**` | 桌面三栏、窄屏抽屉、六 Skill、材料/证据/任务和阻断态完成 | 编辑、版本、任务和 DOCX 按钮均为视觉骨架 |
| Root Agent | 共享设计、路由集成、测试和审核 | `app/components/**`、`app/lib/**`、全局文件、`tests/**`、`docs/**` | 集成与全部门控检查完成 | M1 后必须等待用户审核 |

## 5. 实际渲染页面

| 路由 | 页面名称 | 截图路径 | 视口 | 浏览器检查 |
|---|---|---|---|---|
| `/login` | 登录 | `screenshots/01-login-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects` | 项目列表 | `screenshots/02-projects-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/new` | 五种创建方式 | `screenshots/03-create-paths-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/new/idea` | Idea 创建表单 | `screenshots/04-create-idea-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/new/existing-draft` | 初稿导入与上传队列 | `screenshots/05-create-upload-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/demo/diagnosis?status=draft` | 诊断卡草稿态 | `screenshots/06-diagnosis-draft-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/demo/diagnosis?status=confirmed` | 诊断卡已确认态 | `screenshots/07-diagnosis-confirmed-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/demo/editor?state=warning` | 编辑器写作阻断态 | `screenshots/08-editor-blocked-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects/demo/editor` | 三栏编辑器 | `screenshots/09-editor-desktop.png` | 1440×900 | 200，无控制台错误 |
| `/projects` 状态区 | 五类状态视觉 | `screenshots/10-state-gallery-desktop.png` | 桌面组件 | 已渲染 |
| `/login` | 登录 | `screenshots/11-login-mobile.png` | 390×844 | 无横向溢出 |
| `/projects` | 项目列表 | `screenshots/12-projects-mobile.png` | 390×844 | 无横向溢出 |
| `/projects/new` | 五种创建方式 | `screenshots/13-create-paths-mobile.png` | 390×844 | 无横向溢出 |
| `/projects/demo/editor?state=warning` | 编辑器阻断态 | `screenshots/14-editor-mobile.png` | 390×844 | 无横向溢出；目录/助手抽屉可打开 |

## 6. 演示步骤

1. 打开 `http://localhost:3000/login`。
2. 点击“进入演示工作台”，进入项目列表。
3. 点击“新建项目”，查看五种创建方式。
4. 点击“从一个 Idea 开始”，查看双语、论文类型、字数、日期和引用格式字段。
5. 点击“生成诊断卡草稿”，进入诊断卡草稿态。
6. 点击“确认诊断卡（演示）”，查看已确认状态。
7. 点击“进入论文编辑器”，查看三栏编辑器和六个产品级 Skill。
8. 单独打开 `/projects/demo/editor?state=warning`，查看未确认诊断卡时的写作阻断。

上述点击链已由真实 Chromium 执行，URL 依次正确变化，控制台未产生错误或警告。

## 7. 测试与检查

| 检查 | 实际命令或方式 | 结果 |
|---|---|---|
| 生产构建 | `pnpm run build` | 通过；12 个路由被构建 |
| 代码检查 | `pnpm run lint` | 通过；0 error、0 warning |
| 构建 + SSR 契约测试 | `pnpm run test` | 通过；3/3 tests |
| 六页 SSR | `tests/rendered-html.test.mjs` | 六个核心路由均为 200 并含页面地标 |
| 创建/Skill 契约 | 同上 | 五种创建方式、六个产品级 Skill 全部冻结 |
| 视觉决策 | 同上 | `#FFFBE2`、`#185208` 和 DOCX-only 断言通过 |
| 浏览器路由 | Chromium 真实访问 9 个审核状态 | 全部 200、标题正确、0 console issue |
| 点击链 | 登录 → 项目 → 新建 → Idea → 诊断 → 确认 → 编辑器 | 全部导航成功 |
| 窄屏 | 390×844 四个关键页面 | `scrollWidth = 390`，无横向溢出 |
| 编辑器窄屏入口 | 点击两个 `details` | 目录与章节助手均可打开 |
| 服务端日志 | `.sites-dev-m1.clean.log` | 所有审核请求 200；无 500、未处理异常或 renderer 警告 |

## 8. Mock 与真实能力

- 纯前端 Mock：登录、注册、项目数据、创建表单、上传队列、诊断结果、版本、证据、任务、模型名称、Skill 状态和 DOCX 导出按钮。
- 已接入数据库：无。
- 已接入真实解析：无。
- 已接入真实模型：无。
- 尚未实现：认证、持久化、文件上传与解析、AI 调用、外部检索、真实证据核验、版本保存、真实 DOCX 生成、管理员原型及所有后端能力。
- 供应商、外部数据库、支付、短信、邮件和对象存储均未选择、未接入。

## 9. 已知问题

1. M1 页面使用静态演示数据，刷新不会保留任何操作状态。
2. 筛选、保存版本、任务运行和 DOCX 导出只是视觉骨架。
3. 页面暂用系统字体栈；未引入外部字体文件，避免本地审核依赖网络。
4. 窄屏编辑器的目录与助手是原生 `details` 抽屉，M2 获批后才考虑更完整的交互。
5. Vinext 开发日志的 `compile` 时间显示异常偏大，属于工具日志显示问题；实际请求耗时和页面响应均正常。

## 10. 本阶段变更

- 把原来的单页内存视图拆为真实路由。
- 保留并系统化之前的绿色纸张感视觉。
- 保留用户指定的创建卡配色：初稿文字 `#FFFBE2`；文献卡背景 `#185208`，文字和圆圈 `#FFFBE2`。
- 新增登录、注册、项目列表、五类创建表单、诊断两种状态和三栏编辑器。
- 编辑器从四个快捷动作调整为六个产品级 Skill。
- 将“已验证原文”等可能误导的表述改为“用户上传原文可核对 / 演示”。
- 全站持续显示 Mock 标识，只提供 DOCX 导出入口。

## 11. 需要用户审核的事项

1. 整体绿色、纸张感、研究编辑器风格是否继续作为后续视觉基线。
2. 五张创建卡的层级、大小和配色是否通过，尤其是“初稿”与“文献与范文”两张卡。
3. 诊断卡的草稿黄色提示与已确认绿色状态是否足够清楚。
4. 桌面三栏编辑器的信息密度是否合适。
5. 窄屏编辑器采用“正文优先 + 目录/助手抽屉”的方向是否通过。

## 12. 阶段门结论

当前停留在 M1，等待用户审核；未启动 M2。
