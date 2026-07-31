# M10 Release Candidate 审核

日期：2026-07-31  
分支：`m8-m11/delivery-readiness`  
审核结论：`M10_WAITING_FOR_USER_UI_CONFIRMATION`

## 已通过

- 管理员数据页面、操作审计、功能开关与实验基础已实现。
- 0000→0018 可在全新隔离数据库重放；0018 为增量迁移。
- 0018 增加范围绑定字段和候选版本决定表，不删除或覆盖既有数据。
- ToolIntent 已绑定当前章节、基础版本和不修改范围；Action Proposal 仍要求显式确认。
- 确认后的正式执行入口固定为 REVISER、单模型、单次调用，不重试、不 fallback。
- 候选版本、差异、拒绝和采用已串联到生产 UI；未采用候选不会成为编辑器或 DOCX 导出的当前版本。
- TypeScript、ESLint、Vinext production build、`git diff --check` 通过。
- 闭环专项测试 7/7 通过；迁移、闭环和 DOCX 回归复测 8/8 通过。
- 全量 Node 回归 196 项：185 通过、9 项按环境门跳过；新增迁移断言已更新复测。既有 M9 真实 PPTX 测试因未提供 `ARTIFACT_TOOL_ENTRY` 未运行成功，未计为通过。
- 仓库 Secret/产物扫描通过：426 个跟踪文件、19 条迁移、0 个禁止路径、0 个 secret hit。
- 本地服务健康检查返回 HTTP 200。

## 阻塞项

1. 本地 DeepSeek 环境变量已配置，但真实调用仍为 0；当前没有启用的 REVISER 模型配置，必须由用户在 UI 明确保存本次唯一组合。
2. 真实 Provider 的正式闭环必须由用户在已确认 Action Proposal 上点击一次“确认配置并执行 1 次”。自动化浏览器受 localhost 安全策略阻断，本轮未绕过正式 UI，也未使用脚本直调。
3. 真实调用后的候选、差异、先拒绝再采用同一候选、刷新和服务重启持久化仍待用户验收。
4. `.openai/hosting.json` 缺少可复用的 `project_id`，且 R2 为 `null`；无法安全确定生产部署目标和对象存储绑定。
5. 因上述门未通过，不创建 RC/正式标签，不执行 M11 生产迁移或部署。

## 结论

M10 的最小真实闭环代码与自动检查已准备完成，但严格 Release Candidate 门仍等待用户完成单次正式 UI 调用及持久化验收。因此不得声明 `M10_PASS`，也不得把 M11 标记完成。
