# 工作分解结构（WBS）

| Task ID | 里程碑 | 任务 | 负责人 | 目录所有权 | 前置依赖 | 输入 | 输出 | 验收标准 | 状态 | 风险 | 实际完成情况 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M0-A | M0 | 需求与范围分析 | m0_scope | `docs/product-scope.md`、`docs/acceptance-matrix.md` | 无 | V0.3、Skill 说明 | 范围与验收映射 | 排除项和六 Skill 映射完整 | DONE | 范围误扩张 | 已完成并只读 QA |
| M0-B | M0 | 现有工程审计 | m0_repo_audit / Root Agent | `docs/repository-audit.md` | 无 | `site/`、`web/` | 工程选择建议 | 唯一活动工程证据充分 | DONE | 双工程误维护 | 已冻结 `site/` |
| M0-C | M0 | UX 与信息架构 | m0_ux_map | `docs/product-ui-map.md` | 无 | 需求、现有页面 | IA、路由、状态与截图清单 | 覆盖六个 M1 页面 | DONE | 页面边界不清 | 已完成并只读 QA |
| M0-D | M0 | 前端 Mock 契约 | Root Agent | `docs/frontend-mock-contract.md` | 无 | 需求、Skill 契约 | 类型、状态、Adapter 边界 | 不提前设计正式数据库 | DONE | Mock 被误认真实 | 已完成 |
| M0-I | M0 | M0 集成与基线 | Root Agent | `docs/`、`AGENTS.md` | M0-A/B/C/D | 四份分析 | 管理体系与基线 commit | Git 可回退、活动工程唯一 | IN_PROGRESS | 根 Git 无效 | `site` Git 已初始化，待提交 |
| M1-0 | M1 | 设计 Token 与共享边界 | Root Agent | 共享组件、类型、全局样式 | M0-I | M0 基线 | 设计与组件契约 | 子任务无共享文件冲突 | BACKLOG | 现有单页耦合 | 未开始 |
| M1-1 | M1 | 全局框架与设计系统 | Root Agent | 共享布局与全局样式 | M1-0 | 视觉基线 | 登录后框架与状态组件 | 桌面/窄屏可用 | BACKLOG | 样式冲突 | 未开始 |
| M1-2 | M1 | 认证与项目首页骨架 | 待分配 | 独立路由目录 | M1-0 | Mock 契约 | 登录、注册、项目列表 | 页面真实渲染 | BACKLOG | 误做真实认证 | 未开始 |
| M1-3 | M1 | 创建与诊断骨架 | 待分配 | 独立路由目录 | M1-0 | 五入口契约 | 创建选择、Idea、诊断卡 | 确认前后可区分 | BACKLOG | 误做真实解析 | 未开始 |
| M1-4 | M1 | 三栏编辑器骨架 | 待分配 | 独立路由目录 | M1-0 | 六 Skill 契约 | 编辑器页面 | 未确认诊断阻断明显 | BACKLOG | 暴露内部 Skill | 未开始 |
| M1-QA | M1 | 集成、渲染和审核包 | Root Agent | `docs/reviews/M1/` | M1-1/2/3/4 | 所有页面 | 截图、测试、review | 六页+桌面/窄屏+点击验证 | BACKLOG | 浏览器/服务日志错误 | 未开始 |
