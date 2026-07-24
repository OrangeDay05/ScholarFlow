# 风险登记册

| Risk ID | 风险 | 概率 | 影响 | 应对 | 负责人 | 状态 |
|---|---|---:|---:|---|---|---|
| R-001 | `site/` 与 `web/` 双工程导致误修改或重复部署 | 高 | 高 | M0 选择唯一活动工程；只在其内开发 | Root Agent | MITIGATED |
| R-002 | 根目录 `.git` 无效，缺少可回退基线 | 高 | 高 | 在活动工程建立 Git 仓库并创建基线 commit | Root Agent | MITIGATING |
| R-003 | 现有页面集中在单个超大 `page.tsx` 和全局 CSS | 高 | 中 | M1 只做必要拆分，按路由和目录划分所有权 | Root Agent | OPEN |
| R-004 | Mock 界面被误认为已接入真实 AI/解析 | 中 | 高 | 所有 Mock 状态显著标识；审核包列明真实/Mock | QA | OPEN |
| R-005 | 页面出现 V0.3 排除功能入口 | 中 | 高 | 验收矩阵与浏览器检查逐项扫描 | QA | OPEN |
| R-006 | 开发服务器存在多 renderer 警告 | 中 | 中 | M1 集成后检查控制台和服务端日志，必要时修复 | Root Agent | OPEN |
| R-007 | 视觉变更频繁导致已批准基线漂移 | 中 | 中 | 所有用户视觉反馈写入 change-log；M1 审核后冻结 | Root Agent | OPEN |
| R-008 | 未经批准误触生产部署 | 低 | 高 | M8 前禁止部署；hosting.json 不创建第二项目 | Root Agent | MITIGATED |
