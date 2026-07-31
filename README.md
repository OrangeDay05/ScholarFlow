# 论文 AI 科研全流程平台

基于 Vinext、Cloudflare D1/R2 契约和 Drizzle 构建的科研写作工作台。当前代码覆盖注册登录、项目与材料、渐进式诊断、编辑器、AI 会话契约、版本、DOCX、科研图件、PPTX 和管理运维基础。

## 当前发布状态

- M0—M9：已形成对应实现和自动化证据。
- M10：管理与 Release Candidate 基础已实现，仍处于发布门审核。
- M11：尚未完成生产部署。
- DeepSeek：服务器端接入边界已实现；未配置本地凭据时状态为 `CREDENTIAL_REQUIRED`，真实调用测试会跳过。
- 完整 AI 修改闭环：会话、ToolIntent 和 Action Proposal 已持久化；从确认提案到真实 AITask、候选版本、差异与采用的生产 UI 串联仍为 `PARTIAL`。

不得把页面可点击、Mock 测试通过或类型存在解释为生产可用。

## 本地运行

要求 Node.js `>=22.13.0` 和 pnpm。

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

默认访问：`http://localhost:3000`

本地 D1/R2 状态保存在 `.wrangler/`，该目录不会提交。开发环境变量写入根目录 `.dev.vars`；该文件已被 Git 忽略，只提交空值模板 `.dev.vars.example`。

## DeepSeek 本地配置

复制 `.dev.vars.example` 为 `.dev.vars`，仅在本机填写：

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=
```

不要把真实 Key 放入源码、D1、浏览器、URL、日志、截图或问题报告。配置后必须重启本地服务。未配置前不得运行真实集成测试或将状态标记为 `AVAILABLE`。

## 验证

```powershell
pnpm.cmd exec tsc --noEmit
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd audit --prod --audit-level high
node scripts/m10-release-audit.mjs
```

完整本地人工验收见 [docs/testing/M5-local-user-acceptance.md](docs/testing/M5-local-user-acceptance.md)，发布与回滚流程见 [docs/operations/release-runbook.md](docs/operations/release-runbook.md)。
