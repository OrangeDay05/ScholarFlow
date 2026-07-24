# 问题日志

| Issue ID | 问题 | 发现阶段 | 严重度 | 负责人 | 状态 | 处理计划 |
|---|---|---|---|---|---|---|
| I-001 | 根目录 `.git` 目录存在但不是有效 Git 仓库 | M0 | 高 | Root Agent | RESOLVED | 已在唯一活动工程 `site/` 初始化独立 Git |
| I-002 | 同时存在 `site/` 与 `web/` 两份 vinext 工程 | M0 | 高 | m0_repo_audit / Root | RESOLVED | 已冻结 `site/` 为唯一活动工程，`web/` 只读保留 |
| I-003 | `web/` 仍为 starter，`site/` 才包含用户已审核视觉草稿 | M0 | 中 | Root Agent | RESOLVED | 决策记录与 `site/AGENTS.md` 已明确 |
| I-004 | 本地日志出现 multiple renderers 警告 | M0 | 中 | Root Agent | OPEN | M1 集成后复现、定位和验证 |
| I-005 | 当前仅有单路由，M1 所需六个页面不完整 | M0 | 高 | M1 Agents | OPEN | M1 补齐独立路由和骨架 |
