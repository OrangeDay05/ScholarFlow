# M8.1 科研图件核心闭环检查点

日期：2026-07-29
分支：`m8/research-figures`

## 结论

M8.1 已达到内部审核门。当前实现是本地受信任 Python 执行模式，不是生产级沙箱；M8.2 及以后图型、SVG/PDF/TIFF、概念图件和生产隔离仍未实现。

## 已完成

- CSV 导入与表内编辑，字段名称及 string/number/date/boolean 基础类型识别。
- 图型目录按分布、比较、关系、趋势、矩阵和组合分类；M8.1 真实支持散点、折线、柱状、箱线、手提琴五类，后续图型明确禁用并标注 M8.2。
- 图型专属字段映射、屏幕/单栏/双栏出版预设、中文字体回退和色盲友好配色。
- DataSnapshot、CodeVersion、FigureVersion、RunRecord、FigureAsset 分离持久化；同图相同数据/代码按 hash 复用，每次执行仍创建独立 RunRecord 和 FigureAsset。
- Python 代码默认折叠、可复制/下载；高级编辑显式开启后创建 customized/forked CodeVersion，不覆盖托管版本。
- Worker 只调用 Runner Adapter；本地 Runner 在独立临时目录执行，限制超时、请求体、行数、输出数量/大小、导入及危险 AST；失败保留 RunRecord，不生成资产。
- 真实 PNG 通过本地 R2 Adapter 保存并由所有者隔离 API 读取。

## 数据库

- 新增迁移：`drizzle/0014_pretty_thena.sql`。
- 新增：`figure_data_snapshots`、`figure_code_versions`、`figure_run_records`。
- 对 `figure_projects`、`figure_versions`、`figure_assets` 仅作增量字段/索引扩展。
- 本地 0000→0014 已应用；再次检查返回 `No migrations to apply`。

## 验收矩阵

1. 带表头数据导入：PASS
2. 字段名称与基础类型：PASS
3. 五类真实图型：PASS
4. 手提琴图真实运行：PASS
5. 代码查看与下载：PASS
6. 高级修改创建新 CodeVersion：PASS
7. Runner 真实 PNG：PASS
8. 独立 RunRecord：PASS
9. 失败日志且不覆盖旧图：PASS
10. 独立 FigureAsset：PASS
11. 全链路追溯：PASS
12. M2–M7 回归：PASS
13. TypeScript：PASS
14. 迁移重复检查：PASS
15. `.venv-m8` 未进入 Git：PASS
16. 本地受信任模式提示：PASS
17. 未冒充生产沙箱：PASS

## 验证证据

- TypeScript：`tsc --noEmit`，通过。
- 目标 ESLint：0 error / 0 warning。
- M8 Node/真实 Runner：9/9 通过，含五类真实 PNG。
- Python Runner 冒烟与策略：3/3 通过。
- 全仓回归：150 项，144 pass、6 skip、0 fail。
- Vinext build：通过，M8 API 与页面路由已纳入构建。
- 浏览器：真实 PNG、运行历史、代码折叠/高级编辑、390px 与 1440px 无横向溢出；console 0 error / 0 warning。

## 截图

- `docs/reviews/M8/screenshots/m8-1-desktop-real-png.png`
- `docs/reviews/M8/screenshots/m8-1-mobile-390.png`

## 后续

M8.2 扩展直方图、密度图、点图、误差线、森林图、气泡图、回归图、面积图、热图、相关矩阵、分面图和多面板图；在继续前先处理用户新增的 M5-B4 DeepSeek Provider Pilot。
