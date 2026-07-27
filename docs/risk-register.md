# 风险登记册

| Risk ID | 风险 | 概率 | 影响 | 应对 | 负责人 | 状态 |
|---|---|---:|---:|---|---|---|
| R-001 | `site/` 与 `web/` 双工程导致误修改或重复部署 | 高 | 高 | M0 选择唯一活动工程；只在其内开发 | Root Agent | MITIGATED |
| R-002 | 根目录 `.git` 无效，缺少可回退基线 | 高 | 高 | 在活动工程建立 Git 仓库并创建基线 commit | Root Agent | MITIGATED |
| R-003 | 现有页面集中在单个超大 `page.tsx` 和全局 CSS | 高 | 中 | M1 只做必要拆分，按路由和目录划分所有权 | Root Agent | MITIGATED |
| R-004 | Mock 界面被误认为已接入真实 AI/解析 | 中 | 高 | 所有 Mock 状态显著标识；审核包列明真实/Mock | QA | MITIGATED |
| R-005 | 页面出现 V0.3 排除功能入口 | 中 | 高 | 验收矩阵与浏览器检查逐项扫描 | QA | MITIGATED |
| R-006 | 开发服务器存在多 renderer 警告 | 中 | 中 | M2 收尾时精确清理重复服务器；固定 3000 单实例干净复测，控制台与 stderr 为空且无该警告 | Root Agent | CLOSED |
| R-007 | 视觉变更频繁导致已批准基线漂移 | 中 | 中 | 所有用户视觉反馈写入 change-log；M1 审核后冻结 | Root Agent | OPEN |
| R-008 | 未经批准误触生产部署 | 低 | 高 | M8 前禁止部署；hosting.json 不创建第二项目 | Root Agent | MITIGATED |
| R-009 | 六项 Skill 看起来都可用，但实际前置条件不同 | 高 | 中 | 按诊断、章节和已授权可读材料动态禁用并解释原因 | Root Agent | MITIGATED |
| R-010 | M2 Mock 被误解为真实文件解析、AI 或 DOCX 产物 | 中 | 高 | 页面持续显示 Mock；审核包逐项说明未接入能力 | Root Agent | MITIGATED |
| R-011 | 独立滚动容器导致章节高亮或证据定位状态漂移 | 中 | 中 | 中栏用滚动容器内 IntersectionObserver；章节和证据使用稳定 ID；浏览器双向点击回归 | Root Agent | MITIGATED |
| R-012 | 本地复测进程或日志误进入提交 | 中 | 中 | 记录准确 PID 并在复测后停止；提交前分类未跟踪文件并检查日志、PID、缓存和生成物 | Root Agent | MITIGATED |
| R-013 | V0.4.2 新能力侵入或覆盖已批准的 M2 写作工作台 | 中 | 高 | 独立分支和路由；编辑器只加默认收起入口；统一功能开关；关闭态执行 M2 回归 | Root Agent | MITIGATED |
| R-014 | 新页面被误认为真实外部检索、审稿、制图或 PPT 服务 | 中 | 高 | 页面持续标注 V0.4.2 Mock/未接真实服务；审核报告逐项列出未实现边界 | Root Agent | MITIGATED |
| R-015 | M3 基础 API 出现跨用户读取或写入 | 中 | 高 | 所有项目域 SQL 同时绑定 `owner_user_id`；匿名 401；两用户越权测试返回 404 | Root Agent | MITIGATED |
| R-016 | 本地演示身份在未授权环境静默启用 | 低 | 高 | 必须同时提供显式允许开关与邮箱；默认无身份时拒绝；生产依赖平台认证头 | Root Agent | MITIGATED |
| R-017 | 浏览器安全策略导致 M3 D1 标签未在本轮重启后完成视觉复核 | 中 | 低 | 不绕过浏览器策略；以 API、SSR、构建和源码断言验证；下次新会话补做视觉确认 | Root Agent | OPEN |
| R-018 | 双模型 Mock 被误认为已经接入真实供应商或能验证事实 | 中 | 高 | 页面持续标 Mock；报告明确模型名和结果均为演示；功能开关可完全关闭 | Root Agent | MITIGATED |
| R-019 | 自动审阅直接覆盖正文或形成无限生成循环 | 中 | 高 | 审阅只出报告；用户明确采纳；修订只追加版本；最多一次自动修订和一次最终验证 | Root Agent | MITIGATED |
