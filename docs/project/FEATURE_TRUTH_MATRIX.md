# 功能真实性矩阵

> 审计时间：2026-08-08。状态只使用 READY、PARTIAL、MOCK、BLOCKED、DISABLED、UNKNOWN。READY 仅代表当前本地环境已核实，不代表生产部署完成。

| 功能 | 页面 | API | 持久化 | 外部服务 | 用户闭环 | 状态 | 证据与边界 |
|---|---|---|---|---|---|---|---|
| 注册登录 | 是 | 是 | D1 | 不适用 | 已验证 | READY | 浏览器创建隔离验收账号并自动登录；owner 隔离测试通过 |
| 五种项目起点 | 是 | 是 | D1 | 不适用 | 部分 | PARTIAL | creation_method 仍固定为 idea/existing_draft/requirements/literature/data；四个材料型入口已接通上传后解析与 Candidate 路由，仍待用户逐一 E2E 验收 |
| AI 引导梳理入口 | 是 | 是 | D1 | DeepSeek | 已验证 | READY | 入口创建真实 `idea + guided` 项目并路由到显式 projectId |
| onboarding_mode | 是 | 是 | D1 + 0020 | 不适用 | 已验证 | READY | migration 已应用；旧项目默认 direct；列表同时表达 creation_method 与 AI 引导策略 |
| Conversation Agent | 是 | 是 | D1 | DeepSeek | 已验证 | READY | 真实 DeepSeek 返回项目追问；消息刷新后仍存在；默认平台底座不要求用户先配置 |
| Grill-me | 是 | 是 | D1 | DeepSeek | 可用 | PARTIAL | UI 预设会进入同一真实对话；本轮未单独点击该预设做一次外部调用 |
| 聊天材料上传与解析 | 是 | 是 | D1 + 本地对象存储 | 本地解析 | 已验证 TXT | READY | TXT 保存、ParseRun success、项目材料列表和刷新持久化已验证；不代表所有格式均 READY |
| 授权材料读取 | 是 | 是 | D1 chunks | DeepSeek | 已验证 | READY | AI 准确返回授权 TXT 中的 20 名及“不含姓名、联系方式或研究结果”；未授权材料不进入请求 |
| Research Proposal Candidate | 是 | 是 | 对话 + diagnosis session fields | DeepSeek | 已验证 | READY | 真实 JSON 候选、可编辑；数组字段已规范化；确认前不进入正式事实 |
| Candidate Confirmation Gate | 是 | 是 | D1 | 不适用 | 已验证 | READY | finish 不创建卡；用户确认后才创建 confirmed DiagnosisCard |
| DiagnosisCard 版本链 | 是 | 是 | D1 | 不适用 | 已验证 | READY | 真实 V2 confirmed、V1 superseded；provenance 与正式 USER_CONFIRMED 字段保留 |
| 独立项目诊断卡 | 是 | 是 | D1 | 不适用 | 已验证 | READY | 显示当前 projectId、正式题目、研究对象、问题、方法、材料数和版本历史 |
| 推荐目录 | 是 | 是 | D1 | 不适用 | 已验证 | READY | 真实 7 节目录可编辑、确认；结果章节保持待研究完成边界 |
| 编辑器交接 | 是 | 是 | D1 | DeepSeek 可选 | 已验证 | READY | 确认目录后进入当前项目编辑器；项目标题、7 节目录与 D1 状态刷新后保持 |
| Provider 逐 token 流式展示 | 状态 UI 存在 | 非流式 JSON | 调用记录 | DeepSeek | 未完成 | PARTIAL | 有 WAITING/Stop/Retry/完成状态，但当前响应不是逐 token 流式，不能标 READY |
| 项目删除 | 是 | 是 | D1 | 不适用 | 旧链路 | PARTIAL | 本轮主流程未重新执行删除验收 |
| DOCX 解析/初稿导入 | 是 | 是 | D1 + 对象存储 | 本地解析 | 候选已验证 | PARTIAL | 真实 83 个 chunk 已生成章节导入候选；用户确认前不创建正文 V1，DOCX 表格仍为独立任务 |
| 六个产品 Skill | 是 | 部分真实 | D1 | 依配置 | 未全部闭环 | PARTIAL | 不因 Conversation Agent 闭环而整体标 READY |
| 图件/PPT/DOCX 导出 | 是 | 是/部分 | D1 | 依 Runner | 本轮未验收 | PARTIAL | 明确不在本轮范围 |

## 真实性边界

- AI 对话、材料提取和 AI 推荐只生成候选；只有用户确认内容进入 DiagnosisCard。
- 没有真实研究结果时只允许 Proposal Abstract，不把计划写成发现。
- 当前 E2E 的材料格式是 TXT；PDF/DOCX 等格式仍按各自已验证范围标记。
- 本轮没有部署、提交、合并或推送。
