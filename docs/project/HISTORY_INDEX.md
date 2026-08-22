# 历史索引

> 本文件只做索引，不复制聊天记录，也不作为当前状态真相源。

## 重要基线与检查点

| 阶段/主题 | 提交 | 说明 |
|---|---|---|
| M9 完整性检查点 | `c8cc7ff` | 历史阶段标签；不代表当前全部功能 READY |
| M10 基线 | `4d5470a` | M10 工作起点 |
| delivery-readiness 稳定基线 | `32f1a55` | 当前两条工作线共同祖先 |
| M10 项目上下文 WIP | `6c93e77` | 当前活动分支检查点，约 47 个文件，未完成审计 |
| 上传标题推导 | `2ef82d7` | 独立验收分支 |
| 诊断任务入口 | `a40181f` | 独立验收分支 |
| 初稿原始基线 | `aa898ac` | 建立 existing_draft 的 Sections/V1 |
| 摘要前置部分 | `e086ffe` | 摘要/关键词正式 Section 增量 |
| 默认 DeepSeek role 配置 | `1c13c25` | 配置存在不等于运行 AVAILABLE |
| 项目感知对话流 | `6e23c8d` | context/respond 与持久化增量，仍待当前用户验收 |
| Proposal 交接 | `60d4345` | Action Proposal UI/数据增量 |
| 对话 UI | `67ed43a` | 对话布局增量 |
| 隐藏已解决失败 | `7745547` | 旧错误状态处理增量 |
| Proposal 确认流 | `0563512` | 确认修改交互增量 |
| 目录同步 | `26f71bc` | 中栏与目录联动增量 |
| 双栏对话布局 | `220989c` | 当前独立验收分支 HEAD |

## 当前权威文档

- 当前现场：`docs/project/CURRENT_STATE.md`
- 有效产品决定：`docs/project/PRODUCT_DECISIONS.md`
- 功能真实性：`docs/project/FEATURE_TRUTH_MATRIX.md`
- 唯一任务：`docs/project/ACTIVE_TASK.md`
- 非当前事项：`docs/project/BACKLOG.md`
- 新会话交接：`docs/project/HANDOFF.md`
- 协作纪律：`AGENTS.md`

## 历史资料（只读参考）

- `docs/status-board.md`：阶段状态时间线，含过时 M 标签和相互不同时间点结论。
- `docs/acceptance-matrix.md`：历次验收追加记录，早期“待实现”和后期“通过”并存。
- `docs/decision-log.md`：早期 D001—D014 决定，其中阶段门描述已有废弃项。
- `docs/backlog.md`：旧阶段 Backlog，不能替代 `docs/project/BACKLOG.md`。
- `docs/reviews/`、`docs/testing/`：具体批次证据与测试说明，应按提交和日期核对。

发生冲突时，先以当前 Git/D1/运行环境重新只读核实，再更新 `docs/project/`；不得让旧文档静默覆盖当前事实。
