# M10/M11 发布与回滚运行手册

## 当前门状态

M10 Release Candidate 与 M11 生产发布尚未通过。以下任一项未满足时必须停止：

- 真实 DeepSeek 凭据未由用户在安全环境配置并完成单模型单次验证；
- Action Proposal 确认到 AITask、候选版本、差异和采用/拒绝的生产 UI 未形成完整闭环；
- `.openai/hosting.json` 没有可复用的 `project_id`；
- R2 生产绑定未配置；
- 全量测试、构建、依赖审计、Secret 扫描或迁移演练失败。

## Release Candidate 检查

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec tsc --noEmit
pnpm.cmd lint
pnpm.cmd audit --prod --audit-level high
node scripts/m10-release-audit.mjs
pnpm.cmd build
git diff --check
```

真实 Provider 集成测试只在用户已配置本地凭据并明确授权单次调用后执行。不得自动 fallback、并行测多个模型或记录 reasoning 原文。

## 数据备份与迁移

1. 停止本项目写入或进入维护窗口。
2. 记录应用提交、迁移台账和 D1/R2 绑定。
3. 使用 Cloudflare/Sites 正式备份或导出机制保存 D1。
4. 保存对象清单与关键 hash；真实用户材料不得进入 Git。
5. 在隔离环境验证备份可恢复。
6. 在全新隔离数据库重放 0000→最新迁移。
7. 对生产备份副本演练增量迁移并校验表数、台账、关键记录、所有者和不可变版本关系。

`scripts/m10-local-d1-audit.mjs <sqlite-path>` 仅用于本地只读盘点，不是生产备份工具。

## 部署

1. 读取 `.openai/hosting.json` 并复用其中真实 `project_id`。
2. 若缺少 `project_id`，停止并由用户确认目标 Sites 项目；不得猜测或创建重复站点。
3. 配置 D1、R2 和服务器 Secret，确保 Secret 不进入构建产物或前端。
4. 推送与发布版本一致的提交，保存版本后再部署。
5. 每个 Sites 部署 URL 都视为生产 URL。

## Smoke Test

- 注册、登录、退出和 Session 撤销。
- 项目与跨用户隔离。
- TXT 材料上传、解析、刷新与重启持久化。
- 会话、ToolIntent、Action Proposal 和未确认阻断。
- 单模型单次 Provider 调用（仅有凭据且用户确认时）。
- 候选版本不自动采用、差异、拒绝和采用。
- DOCX、图件和 PPTX 的所有者下载。
- 管理员授权、普通用户拒绝和审计日志。
- 无浏览器控制台新增错误，无 Key 或堆栈泄漏。

## 回滚

1. 停止新写入和外部任务。
2. 将流量切回上一已验证版本。
3. 仅应用回滚时，不逆向修改兼容的增量 Schema。
4. 必须回滚数据时，使用部署前验证过的备份恢复到新实例并核对 hash/行数，再切换绑定。
5. 保留失败版本日志、迁移证据和审计记录；禁止在原库上做未经演练的破坏性 DDL。

