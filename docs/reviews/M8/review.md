# M8 科研图件最终检查点

日期：2026-07-29
分支：`m8/research-figures`

## 结论

M8 已达到审核门。统计图当前是本地受信任 Python 执行模式，不是生产级沙箱；概念图使用不执行任意代码的受控 SVG 模板。生产隔离仍属于部署前事项。

## 已完成

- CSV 导入与表内编辑，字段名称及 string/number/date/boolean 基础类型识别。
- 图型目录按分布、比较、关系、趋势、矩阵和组合分类；M8.1 真实支持散点、折线、柱状、箱线、手提琴五类，后续图型明确禁用并标注 M8.2。
- 图型专属字段映射、屏幕/单栏/双栏出版预设、中文字体回退和色盲友好配色。
- DataSnapshot、CodeVersion、FigureVersion、RunRecord、FigureAsset 分离持久化；同图相同数据/代码按 hash 复用，每次执行仍创建独立 RunRecord 和 FigureAsset。
- Python 代码默认折叠、可复制/下载；高级编辑显式开启后创建 customized/forked CodeVersion，不覆盖托管版本。
- Worker 只调用 Runner Adapter；本地 Runner 在独立临时目录执行，限制超时、请求体、行数、输出数量/大小、导入及危险 AST；失败保留 RunRecord，不生成资产。
- 真实 PNG 通过本地 R2 Adapter 保存并由所有者隔离 API 读取。
- M8.2 开放完整 17 类统计图：直方图、密度图、箱线图、手提琴图、柱状图、点图、误差线图、森林图、散点图、气泡图、回归图、折线图、面积图、热图、相关矩阵图、分面图和多面板图。
- 相关矩阵和多面板映射支持数组及嵌套来源列追溯，不再被字符串映射校验误拒绝。
- 论文出版预设同一次运行创建 PNG、SVG、PDF、TIFF；每个资产独立保存格式、MIME、SHA-256、大小和来源 RunRecord。
- SVG 拒绝脚本、事件处理器、JavaScript、data/file 和外部 href；PNG/PDF/TIFF 校验文件签名，Runner 不接受未请求格式。
- 五类概念图件均使用参数化受控 SVG：机制图、理论框架图、研究流程图、Graphical Abstract 和科研信息图。
- 用户可查看 Mermaid 结构代码，但服务端不执行该文本；每次生成建立数据快照、代码版本、图件版本、RunRecord 和 SVG 资产。

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
18. 17 类统计图真实 PNG：PASS
19. 相关矩阵多列映射：PASS
20. 多面板嵌套映射：PASS
21. 四格式真实输出：PASS
22. SVG 主动内容与外链拦截：PASS
23. 二进制格式签名与 MIME：PASS
24. 资产清单和所有者隔离下载：PASS
25. 五类概念图契约：PASS
26. 节点/边数、ID、标签和关系校验：PASS
27. 标签 XML 转义与无外链 SVG：PASS
28. 概念图不可变版本和所有者隔离：PASS
29. 结构代码可查看但不执行：PASS

## 验证证据

- TypeScript：`tsc --noEmit`，通过。
- 目标 ESLint：0 error / 0 warning。
- M8 Node/真实 Runner：9/9 通过，含五类真实 PNG。
- Python Runner 冒烟与策略：3/3 通过。
- 全仓回归：150 项，144 pass、6 skip、0 fail。
- Vinext build：通过，M8 API 与页面路由已纳入构建。
- 浏览器：真实 PNG、运行历史、代码折叠/高级编辑、390px 与 1440px 无横向溢出；console 0 error / 0 warning。
- M8.2 Node 契约/仓储：5/5 通过。
- M8.2 真实 Runner：前 16 类批量通过；外层 240 秒命令上限到达后，多面板图单独运行通过，合计 17/17。
- M8.2 目标 ESLint：120 秒内无输出并超时，记录为非阻塞工具超时；TypeScript 通过，`git diff --check` 单独复核。
- M8.3 Python Runner 安全/冒烟：5/5 通过。
- M8.3 真实多格式 Runner：1/1 通过，一次运行实际生成 PNG、SVG、PDF、TIFF。
- M8.3 TypeScript：通过。
- M8.4 专项测试：2/2 通过。
- M8.4 TypeScript：通过。

## 截图

- `docs/reviews/M8/screenshots/m8-1-desktop-real-png.png`
- `docs/reviews/M8/screenshots/m8-1-mobile-390.png`

## 后续

M9 将图件资产绑定并插入真实 PPTX，完成 13 种场景、讲者备注、问答准备与打开验证。
