# 当前唯一任务

## 状态

`READY_FOR_CREATION_FLOW_ACCEPTANCE`

## 已完成纵向流程

`/projects/new → AI 帮我梳理 → real projectId → Conversation Agent / Grill-me → 材料保存、解析与授权读取 → Research Proposal Candidate → 用户编辑并确认 → DiagnosisCard → 推荐目录 → 用户修改并确认 → 编辑器`

关键事实：

- creation_method 仍只有五种；`onboarding_mode = direct | guided` 为独立维度。
- AI 对话、材料提取与建议只能形成 Candidate。
- 只有用户确认后才创建正式 DiagnosisCard；正式版本追加且不覆盖。
- 默认 DeepSeek 由平台服务端 Secret 提供，用户侧配置仍是可选项。
- 当前真实 E2E 已验证同一 projectId、同一 owner、同一持久化链路。

## 等待用户验收

1. 从 existing_draft、requirements、literature、data 任一入口上传材料，确认状态从上传进入解析成功，而非永久等待解析。
2. 创建后进入 Candidate 工作台；没有用户确认时不得显示为正式项目诊断卡。
3. existing_draft 完成诊断与提纲后进入编辑器，确认自动出现章节导入候选。
4. 用户检查候选映射后确认，系统仅为空章节创建 `source=original` 的正文 V1，原文件与解析材料均保留。

## 明确不处理

- Workspace、Membership、Reviewer、M11。
- 部署、支付、管理后台或 Provider 扩展。
- PPT、Figures、DOCX 表格和编辑器重写。
- Backlog 中其他事项。
