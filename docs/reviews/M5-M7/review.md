# M5—M7 连续实现审核报告

日期：2026-07-29
分支：`m5/real-services-foundation`

## 结论

- M5 内部功能实现完成；真实 OpenAI/DeepSeek 端到端调用尚未执行，因为本轮没有用户明确提供的专用测试凭据。该项不得标为已验证。
- M6 证据、高级审阅、投稿准备与 DOCX 已实现并通过行为测试；DOCX 已由本机 Microsoft Word 以不可见只读方式真实打开。
- M7 决定信、Comment、Revision Task、Response Draft、修改核对与 Response Letter DOCX 已实现并通过端到端测试。
- 当前停在 M7 审核门，未进入 M8、M9、M10、M11。

## M5

- 原文件不可覆盖；解析重跑创建新 ParseRun，Chunk 保留页码、段落、Sheet、行列、记录或字段位置。
- 扫描 PDF 返回 OCR_REQUIRED，不伪装成功；图片只登记资产和尺寸，不声明图像理解。
- 用户 Key 使用 AES-GCM-256 服务端加密，AAD 绑定用户和凭据；明文不进入响应、日志或普通字段。
- OpenAI 与 DeepSeek 使用同一 Provider Adapter 契约；六个产品 Skill 不私自定义供应商请求。
- Runner 有标准/严格/自定义上限，预算暂停等待用户，审阅不覆盖正文，部分失败保留成功产物。
- 生成、修订和汇总产物追加章节候选版本，默认未采用；用户采用沿用显式操作。

## M6

- Claim/Evidence 只能绑定当前用户、当前项目、最新成功解析的 MaterialChunk。
- 直接引文必须能在来源片段中规范化匹配；不匹配标为 CONFLICTING，缺少原文标为 UNVERIFIED。
- 冲突证据、高风险未核验证据、未核验正式引用元数据会阻断 DOCX。
- 高级审阅 Finding 绑定范围和证据，不直接修改正文。
- 项目含数据材料时，Data Availability 为空会阻断投稿准备；未完成检查项也会阻断。
- DOCX 为真实 OOXML，绑定用户所选章节版本并写入不可变 Storage Adapter；无 PDF/Markdown 导出。

Word 打开验证：`Opened=true`，读取 6 个段落，标题、章节、正文和参考文献均可见；验证文件位于临时目录，不提交仓库。

## M7

- 决定信按 Reviewer 与 Comment 拆分并幂等保存。
- 每条 Comment 可建立 Revision Task，绑定章节和基础版本。
- 回应策略支持 AGREE、PARTIALLY_AGREE、DISAGREE；部分同意/不同意必须填写理由。
- 未完成实验以独立警告保存并写入 Response Letter，不得伪装已经完成。
- Response Draft 追加版本且由用户显式确认；返修正文创建新章节版本，不覆盖原稿。
- 修改核对要求同一章节、内容确有变化且回复已确认；否则保持未解决。
- Response Letter DOCX 仅包含已验证任务和用户确认回复，绑定返修任务与结果版本。

## 迁移

- `0011_m6-evidence-export.sql`：为 Evidence 和 ExportRecord 增加可追踪/阻断字段。
- `0012_m7-revision-response.sql`：增加 Response Letter 类型与返修验证字段。
- `0013_m7-comment-decisions.sql`：增加 Comment 状态、回应策略、决定理由和未完成实验警告。
- 三个迁移均为添加列/索引，不包含 DROP、DELETE 或表重建；专项测试从 0000 顺序回放到最新迁移。

## 已知限制

- 未提供专用测试凭据，因此真实供应商网络调用未验证；代码和 stub 行为通过不等于供应商账户可用。
- DOCX 当前覆盖标题、章节正文和参考文献；表格、图片、图注和目录只在存在对应结构化输入后才能进入后续增强，不能凭空生成。
- 扫描 PDF OCR、复杂图像理解、科研图件、PPTX、发布候选和部署不在 M5—M7 本轮范围。

## 审核建议

先审核 M6/M7 数据边界和实际 DOCX，再决定是否提供专用测试凭据关闭 M5 外部验收项。任何生产 Key、生产部署、图件或 PPTX 均需独立授权。

## 最终自动化结果

- TypeScript：通过。
- 全仓 ESLint：通过。
- 自动化测试：141 项，135 通过、0 失败、6 项环境型跳过。
- Vinext build：通过；M6/M7 四组 API 路由进入构建清单。
- `git diff --check`：通过。
