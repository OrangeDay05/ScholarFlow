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
| I-011 | 本地 Cloudflare Worker 不会自动继承 PowerShell 中的演示身份变量 | M3 | 中 | Root Agent | RESOLVED | 仅当显式开关和邮箱同时存在时由 Vite 配置注入本地 Worker `vars`；默认匿名仍为 401 |
| I-012 | 开发服务器热重载期间浏览器停在连接失败数据页，后续被浏览器 URL 安全策略阻断 | M3 | 低 | Root Agent | OPEN | 不绕过策略；保留重启前 M2 页面渲染证据，改用 API、SSR、构建和自动化测试完成本轮基础数据验证；下次新浏览器会话补看 D1 标签 |
| I-013 | 一次经 `.cmd` 与日志管道的开发服务器启动只输出 banner，60 秒内未监听端口 | M3 | 低 | Root Agent | RESOLVED | 准确终止该执行单元，改用 Vinext Node CLI 直接入口；后续两次有限时启动均成功 |
| I-014 | M3 前端可能诱导用户粘贴真实 API Key | M3 增量 Mock | 高 | Root Agent | RESOLVED | 真实 Key 输入框禁用并明确标注不收集；仅使用掩码演示值，源码测试确认无浏览器存储和供应商调用 |
| I-015 | 本地 D1 已存在 42 张业务表，但 `d1_migrations` 台账为 0 条 | M4-B1 | 高 | Root Agent | RESOLVED | 用户批准方案 A。旧状态完整归档至 `E:\论文系统\local-d1-archives\20260728-102348-I-015-9391D72F`，原库 SHA-256 为 `9391D72F0987F2B3080152582D41DA898214FCEF35250F547A4F4282CEC15CDD`；新持久化库位于 `site\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite`，0000→0004 台账 5 条、58 张业务表、重复迁移无待执行项。唯一标记 `I015_PERSISTENCE_20260728_1052` 经运行时写入、重启读取、匿名 401 与跨用户 404 验证。回滚时停止项目服务，将当前状态目录移出并把已校验归档目录恢复到原位置。 |
| I-016 | CORE-01 登录与注册仍为 M1/M2 Mock，缺少真实凭据验证、Session、游客门禁和生产路径身份来源 | M4-H2 | 高 | Root Agent | RESOLVED | M4-H2A 增加 PBKDF2 密码哈希、注册/登录/退出/Session API 和 0005 增量迁移；M4-H2B 将项目页面及 M3/M4 API 切换为服务器 Session 身份，移除开发身份 Header/本地演示身份生产路径，验证匿名 401/重定向、跨用户 404、伪造 user_id 无效及重启后 Session 有效。 |
| I-017 / M5-FU-01 | `BUDGET_PAUSED` 当前恢复决策仍会返回 `RESUME`，不符合必须等待用户增加预算或重新确认的规则 | M5-B1 审核 | 高 | Root Agent | RESOLVED | `BUDGET_PAUSED` 已固定返回 `WAIT_FOR_USER`，专项测试覆盖，暂停后不会自动继续调用。 |
| I-018 / M5-FU-02 | Provider Adapter 尚无统一 `M5ProviderError` 和安全错误字段 | M5-B1 审核 | 高 | Root Agent | RESOLVED | Provider 错误已统一为安全 code、retryable、provider、statusCode、retryAfterSeconds 和 safeMessage；上游响应正文与凭据不进入错误。 |
