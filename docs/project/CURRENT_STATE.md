# 当前项目状态

> 更新时间：2026-08-08（Asia/Singapore）。本文件记录当前活动工程的事实，不把测试通过等同于生产部署完成。

## Git 与工作区

| 项目 | 当前事实 |
|---|---|
| 活动工程 | `E:\论文系统\site` |
| 当前分支 | `wip/m10-project-context-audit` |
| 当前 HEAD | `6c93e7727f5806ccbfea96160265fae2c86318bc` |
| 当前工作区 | AI 引导梳理完整纵向流程未提交；进入本轮前已有的 `AGENTS.md` 和 `docs/project/` WIP 均保留 |
| 提交/部署 | 本轮未提交、未合并、未推送、未部署 |

## 运行与数据库

- 当前工程服务运行于 `http://localhost:3000`，使用活动工程源码、`.dev.vars` 与本地对象存储开关。
- 活动 D1 为 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`。
- `0020_project_onboarding_mode.sql` 已应用到活动 D1；旧项目均按默认值回填为 `direct`。
- 平台默认 DeepSeek Key 已由服务端 Secret 读取；浏览器真实调用成功，Key 未进入前端、日志或数据库明文字段。

## 当前产品状态

- `/projects/new` 保留五种 creation_method，并提供独立“让 AI 帮我梳理”策略入口。
- guided 入口先创建真实 `idea + guided` 项目，再进入显式 projectId 的 Conversation Agent。
- 对话、消息、材料保存、解析、项目级授权读取均为真实持久化链路。
- Research Proposal Candidate 可编辑；AI 内容在确认前不是正式事实。
- 用户确认 Candidate 后生成版本化 DiagnosisCard；再次确认生成 V2，V1 保留为 superseded。
- 独立“项目诊断卡”页面是正式事实源；确认后的推荐目录可编辑、确认并进入真实编辑器。
- 四个材料型创建入口在原始对象存储成功后会立即创建独立 ParseRun；不再永久停留在 `awaiting_parse`。
- direct 创建进入独立 Candidate 工作台，用户确认后才进入正式项目诊断卡。
- 解析成功的 manuscript 与编辑器正文仍保持分离；空正文项目会显示章节导入候选，用户确认后才创建 `source=original` 的正文 V1。
- 真实浏览器验收项目 `5d6d1eb3-2a95-482e-8801-ef4ac5b78abc` 已完成：DeepSeek 对话、TXT 材料保存解析与读取、Candidate、DiagnosisCard V2、7 节目录编辑确认、编辑器加载和刷新持久化。

## 验证结果

- `vinext build`：通过。
- 核心集成测试：24/24 通过（M4 隔离、M5 对话持久化/知识/材料解析、M10 项目上下文）。
- 活动 D1 migration 与真实浏览器纵向链路：通过。
- 当前仍不把“真正逐 token 流式展示”标为完成；现有页面有等待、Stop、Retry 和完成状态，但 Provider 响应仍以单次 JSON 返回。

## 当前唯一任务

等待用户对创建方式、自动解析和初稿正文导入候选做最终手工验收；不扩展 Workspace/Membership/Reviewer/M11、部署、PPT、Figures 或 DOCX 表格任务。
