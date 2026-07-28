# 状态看板

更新时间：2026-07-28

## 当前

- 当前里程碑：M5 真实文件、AI、BYOK 与任务恢复
- 当前状态：M5_IN_PROGRESS（M5-B3B 文本与文献记录解析）
- 活动工程：`site/`（唯一活动工程）
- 当前分支：`m5/real-services-foundation`
- M0/M1/M2/M3：已完成
- M2 审核状态：用户已批准，作为核心写作工作台和视觉基线
- 当前有效需求：`docs/requirements/论文AI科研全流程平台需求说明_V0.5.1_M4修订版.txt`
- M4 起点 HEAD：`6344af03bcc8ed58e3f849c7cd92c6b7184aa509`
- 当前批次：M5-B4 Provider、加密凭据与六 Skill Adapter
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
- M5-B2B：DONE — 会话、消息与派生摘要 Repository/API、幂等、归档和所有者隔离；0007 仅生成未执行。
- M5-B2C：DONE — ToolIntent、Action Proposal、一次性用户决定、恢复状态、材料授权校验和所有者隔离；0008 仅生成未执行。
- M5-B2D：DONE — 有界消息分页、追加式压缩计划、连续摘要来源、恢复快照、失败重试策略与完整权限回归。
- M5-B3A：DONE — Storage Adapter、本地 R2、真实上传、安全探测、0006、隔离与补偿。
- M5-B3B：DONE — TXT、CSV、BibTeX、RIS 解析；ParseRun/Chunk 版本、来源位置、失败状态、隔离与幂等。
- M5-B3C：DONE — DOCX 段落/标题位置与文本型 PDF 页码解析；扫描 PDF 明确要求 OCR，未伪装成功。
- M5-B3D：DONE — XLSX Sheet/行/单元格/公式来源登记与 PNG/JPEG 尺寸资产登记；不执行公式或图像理解。
- M5-B3E：DONE — 项目内最新成功解析片段检索、来源返回、查询限制与所有者隔离；不冒充向量/外部检索。
- M5-B4：DONE — AES-GCM 用户 Key、显式保存/测试/禁用/删除、OpenAI/DeepSeek Adapter、统一错误与六 Skill 请求契约；未配置 Key 时不调用。
- M5-B5：PENDING — 执行、审阅、候选/采用版本、DOCX 与 M5 收尾。

## 阶段边界

- 允许 M5 所需的真实文件解析、服务端密钥加密、Provider/Skill Adapter、任务执行恢复、预算和失败降级。
- 真实 Key 只能在用户明确提交后由服务端加密，不得进入前端持久状态、日志、错误或普通字段。
- 无凭据时不得发起供应商调用或伪装成功；所有外传必须通过材料授权、隐私模式和处理副本门。
- 不进入 M6 的正式 Evidence/DOCX，不生成真实 PPTX，不部署。
- 不重做已完成的 M2/M3 前端；关闭新增开关后保留完整 M2 体验。

## 下一步

进入 M5-B5：可恢复 Runner、预算/取消/降级、生成/审阅/验证、候选采用版本与 M5 收尾。
