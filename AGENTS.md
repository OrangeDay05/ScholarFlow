# 论文 AI 系统协作规则

## 活动工程与必读顺序

- 当前唯一活动工程是 `E:\论文系统\site`。其他目录和 worktree 只读，除非用户明确授权切换。
- 开始任何任务前，依次阅读：
  1. `docs/project/CURRENT_STATE.md`
  2. `docs/project/ACTIVE_TASK.md`
  3. `docs/project/PRODUCT_DECISIONS.md`
  4. `docs/project/FEATURE_TRUTH_MATRIX.md`
  5. `docs/project/HANDOFF.md`
  6. `docs/project/BACKLOG.md`
  7. `docs/project/HISTORY_INDEX.md`

## 长期工作纪律

- 每轮只交付一个用户可观察结果；相邻问题只登记到 Backlog。
- 修改前先只读核对分支、HEAD、工作区、运行服务、数据位置和相关实现证据。
- 预计修改超过 10 个业务文件时停止并请求用户确认。
- 新增核心实体或数据库 migration 前停止并请求用户确认。
- 不得用 Mock、案例数据、硬编码数组或 fallback 冒充真实项目数据。
- 不得默认选择 `projects[0]`；项目上下文必须来自当前路由、会话和已校验的 `projectId`。
- 不得因页面存在、按钮可点或单元测试通过就宣称端到端 READY。
- 未经用户批准不得进入下一阶段、合并分支、部署、清理现场、提交或 stash。
- “完成”必须以用户验收为最终门；自动检查通过只表示等待验收。
- 保护已有 WIP 和本地 D1/R2；不使用破坏性 Git 或数据命令。
- Secret 不得进入聊天、源码、Git、普通数据库字段、前端、URL 或日志。
