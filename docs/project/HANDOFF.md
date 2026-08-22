# 新会话交接

## 当前现场

- 活动工程：`E:\论文系统\site`
- 分支：`wip/m10-project-context-audit`
- HEAD：`6c93e7727f5806ccbfea96160265fae2c86318bc`
- 工作区：AI 引导梳理纵向流程未提交；保留原有 `AGENTS.md` 与 `docs/project/` WIP。
- 本地服务：`http://localhost:3000`，当前工程源码，允许真实 DeepSeek 网络调用。
- 活动 D1：已应用 `0020_project_onboarding_mode.sql`。

## 已实现

- 五种 creation_method + 独立 onboarding_mode。
- guided 入口创建真实项目并使用显式 projectId。
- 项目默认 Conversation Agent / Generator 使用平台 DeepSeek；手工配置是可选项。
- Conversation 持久化、材料上传/解析、显式材料授权读取。
- 可编辑 Research Proposal Candidate。
- Candidate → 用户确认 → 版本化 DiagnosisCard；V1/V2/superseded 已真实验证。
- 独立项目诊断卡、推荐目录草稿、目录修改确认、编辑器真实 D1 加载。
- 修复从 guided 客户端跳转后全局持久化上下文不重新 hydrate 的问题。
- 修复材料型创建入口只上传不解析的问题；上传完成后调用真实 ParseRun。
- 恢复 direct 创建的独立 Candidate 路由 `/projects/:projectId/diagnosis/candidate`，正式 `/diagnosis` 仍只展示已确认事实。
- 新增 manuscript 章节导入候选；真实初稿 83 个 chunk 已完整分配，确认后才创建原始正文 V1。

## 验证证据

- `vinext build` 通过。
- 核心集成测试 24/24 通过。
- 真实 E2E 项目：`5d6d1eb3-2a95-482e-8801-ef4ac5b78abc`。
- DeepSeek 已真实回答项目问题并准确读取授权 TXT 中“20 名”和“不含姓名、联系方式或研究结果”。
- DiagnosisCard V2 confirmed，V1 superseded；目录 7 节已确认并进入编辑器，刷新后仍为 D1 数据。

## 当前唯一下一步

用户按 `ACTIVE_TASK.md` 验收创建方式、自动解析与初稿正文导入候选。

## 已知边界

- Provider 返回仍是单次 JSON；逐 token 流式展示未完成，不能标 READY。
- guided 当前每次生成 1 个 Candidate（规则允许 1–3 个）；尚未实现同屏多方案比较。
- 本轮没有提交、合并、推送或部署。
