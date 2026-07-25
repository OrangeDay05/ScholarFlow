# 问题日志

| Issue ID | 问题 | 发现阶段 | 严重度 | 负责人 | 状态 | 处理计划 |
|---|---|---|---|---|---|---|
| I-001 | 根目录 `.git` 目录存在但不是有效 Git 仓库 | M0 | 高 | Root Agent | RESOLVED | 已在唯一活动工程 `site/` 初始化独立 Git |
| I-002 | 同时存在 `site/` 与 `web/` 两份 vinext 工程 | M0 | 高 | m0_repo_audit / Root | RESOLVED | 已冻结 `site/` 为唯一活动工程，`web/` 只读保留 |
| I-003 | `web/` 仍为 starter，`site/` 才包含用户已审核视觉草稿 | M0 | 中 | Root Agent | RESOLVED | 决策记录与 `site/AGENTS.md` 已明确 |
| I-004 | 本地日志出现 multiple renderers 警告 | M0 | 中 | Root Agent | RESOLVED | 干净重启后复测 9 个状态，浏览器和服务日志均无警告 |
| I-005 | 当前仅有单路由，M1 所需六个页面不完整 | M0 | 高 | M1 Agents | RESOLVED | 已拆分真实路由并通过 SSR/浏览器检查 |
| I-006 | 登录表单初版以 GET 提交，Mock 密码进入查询参数 | M1 | 高 | Root Agent | RESOLVED | 改为纯前端演示链接；点击后 URL 不含账号或密码 |
| I-007 | 目录确认条使用 sticky 定位，在长截图和部分视口中遮挡章节行 | M2 | 中 | Root Agent | RESOLVED | 改为文档流内静态确认条；重新渲染六个章节均可见 |
| I-008 | 首轮 M2 集成期间开发服务器热更新产生瞬态状态 | M2 | 低 | Root Agent | RESOLVED | 完成代码后干净重启；浏览器控制台与服务日志复测无错误 |
| I-009 | 编辑器三栏共同撑高 Body，右栏长内容导致中栏下方出现大量空白 | M2 | 高 | Root Agent | RESOLVED | 工作区固定为视口剩余高度；三栏各自管理滚动，右栏内容与任务状态分区 |
| I-010 | M2 收尾期间遗留两个 site `vinext dev` 进程并占用 3000/3001 | M2 | 中 | Root Agent | RESOLVED | 精确核对并停止 PID 38308、38380 及直属子进程；固定 3000 干净复测后停止 PID 28152，无项目进程或端口遗留 |
