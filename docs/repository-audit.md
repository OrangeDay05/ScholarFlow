# 工程审计

审计日期：2026-07-24  
审计范围：`E:\论文系统\site`、`E:\论文系统\web`、工作区 Git 与 Sites 配置

## 结论

`E:\论文系统\site` 是后续唯一活动工程。`web` 保留为只读历史脚手架，不删除、不修改，也不参与本阶段构建。

| 检查项 | `site` | `web` | 判定 |
|---|---|---|---|
| 页面进度 | 已有用户持续调整过的单页视觉稿 | Vinext 初始模板 | `site` 明显领先 |
| 依赖 | `node_modules` 与 `pnpm-lock.yaml` 已存在 | 未安装依赖 | 使用 `site` |
| 本地运行 | `http://localhost:3000/` 可访问 | 未运行 | 使用 `site` |
| 构建记录 | `pnpm run build` 已成功 | 未验证 | 使用 `site` |
| 产品视觉资产 | 已包含绿色产品视觉和创建卡片 | 无产品视觉 | 使用 `site` |
| Sites 配置 | `.openai/hosting.json` 存在但无 `project_id` | 同样无 `project_id` | 本阶段不部署 |

## 工程结构

- 前端：Vinext 0.0.50、React 19、Next 兼容 App Router 目录。
- 活动页面：审计时主要逻辑集中在 `app/page.tsx`，通过客户端内存状态切换页面。
- 全局样式：审计时集中在 `app/globals.css`。
- 现有测试：`tests/rendered-html.test.mjs`。
- 运行时：项目要求 Node `>=22.13.0`。

## 已识别问题

| 编号 | 严重度 | 问题 | M0/M1 处理 |
|---|---|---|---|
| REP-01 | 高 | 工作区根目录存在 `.git` 目录，但 Git CLI 报告其不是有效仓库 | 在 `site` 内初始化独立 Git 仓库 |
| REP-02 | 高 | 当前单页内存视图不满足 M1 的真实路由与六页渲染要求 | M1 拆分为冻结路由 |
| REP-03 | 中 | `site` 与 `web` 双脚手架容易产生误修改 | 用 `site/AGENTS.md` 和决策记录冻结唯一活动工程 |
| REP-04 | 中 | `.openai/hosting.json` 没有 `project_id` | 不创建站点、不生产部署，留待后续批准阶段 |
| REP-05 | 中 | 开发日志出现 React 多渲染器上下文警告 | M1 重构后重新检查浏览器与服务端日志 |
| REP-06 | 低 | 根目录预览 PNG 和本地开发日志不是源代码 | 通过 `.gitignore` 排除，不删除原文件 |

## 基线命令

在 `E:\论文系统\site` 执行：

```powershell
$env:CI='true'
pnpm run build
pnpm run lint
```

浏览器审核使用已有本地地址 `http://localhost:3000/`。M1 截图保存到 `docs/reviews/M1/screenshots/`。

## M0 出口检查

- [x] 唯一活动工程已确定。
- [x] 历史脚手架处理方式已确定。
- [x] 框架、运行命令与测试入口已记录。
- [x] Git 风险与修复路径已记录。
- [x] Sites 配置与“不部署”边界已记录。
- [x] M1 路由化差距已记录。
