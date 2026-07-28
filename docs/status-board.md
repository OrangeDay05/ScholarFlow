# 状态看板

更新时间：2026-07-28

## 当前

- 当前里程碑：M5 真实文件、AI、BYOK 与任务恢复
- 当前状态：WAITING_FOR_REVIEW（M5-B2A Conversation Agent 基础）
- 活动工程：`site/`（唯一活动工程）
- 当前分支：`m5/real-services-foundation`
- M0/M1/M2/M3：已完成
- M2 审核状态：用户已批准，作为核心写作工作台和视觉基线
- 当前有效需求：`docs/requirements/论文AI科研全流程平台需求说明_V0.5.1_M4修订版.txt`
- M4 起点 HEAD：`6344af03bcc8ed58e3f849c7cd92c6b7184aa509`
- 当前批次：M5-B2A 对话优先 AI 工作台与 Conversation Agent 基础已完成，等待审核
- M4 审计与批次计划：`docs/audits/m4-v051-gap-and-batches.md`
- M5 批次计划：`docs/audits/m5-v051-batches.md`
- 生产部署：未授权、未执行

## M4 批次

- M4-B1：DONE — V0.5.1 基线、共享契约、差距矩阵和迁移策略。
- M4-B2：DONE — 账号、项目、材料所有权与五种起点持久化。
- M4-B3：DONE — 渐进式诊断、版本和任务级就绪持久化。
- M4-B4：DONE — AI Task、审阅、用户决定和采用版本关系。
- M4-B5：DONE — 隐私画像、处理副本、伪匿名、外传和分析保真。
- M4-B6：DONE — PPT 场景/版本以及 Provider/BYOK 元数据。
- M4-B7：DONE — 请求级隔离、迁移链、全量检查和 M4 审核包。
- M4-H1：DONE — 按方案 A 完整归档旧本地 D1，创建新持久化 D1，验证 0000→0004、58 表、5 条台账、运行时连接、重启持久化和权限隔离。
- M4-H2：DONE — 真实邮箱/手机号注册、密码哈希、登录、服务器端 Session、退出撤销、游客拦截和基于 Session 的项目所有者隔离；增量迁移 0005 已应用。

## M5 批次

- M5-B1：DONE — 六 Skill 输入输出、Provider Adapter、凭据解析、预算、超时和恢复契约。
- M5-B2A：DONE — 双页签、Conversation Agent、六 Skill 默认 Prompt、ToolIntent、摘要、Action Proposal 与用户确认门。
- M5-B2B—B2D：PENDING — 会话/摘要/提案持久化、所有者隔离、压缩与恢复回归。
- M5-B3A：DONE — Storage Adapter、本地 R2、真实上传、安全探测、0006、隔离与补偿。
- M5-B3B 以后：PENDING — 文本/结构解析、来源定位、项目知识库与恢复回归。
- M5-B4：PENDING — 真实 Provider、凭据与六 Skill Adapter。
- M5-B5：PENDING — 执行、审阅、候选/采用版本、DOCX 与 M5 收尾。

## 阶段边界

- 允许 M5 所需的真实文件解析、服务端密钥加密、Provider/Skill Adapter、任务执行恢复、预算和失败降级。
- 真实 Key 只能在用户明确提交后由服务端加密，不得进入前端持久状态、日志、错误或普通字段。
- 无凭据时不得发起供应商调用或伪装成功；所有外传必须通过材料授权、隐私模式和处理副本门。
- 不进入 M6 的正式 Evidence/DOCX，不生成真实 PPTX，不部署。
- 不重做已完成的 M2/M3 前端；关闭新增开关后保留完整 M2 体验。

## 下一步

审核 M5-B2A 后再进入会话持久化小批次；当前 Action Proposal 只确认、不执行，文件仍只到 `AWAITING_PARSE`。
