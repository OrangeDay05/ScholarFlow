# 有效产品决定

## 创建与项目诊断的正式规则

1. `creation_method` 只表达用户以何种材料或状态开始项目，固定为 `idea`、`existing_draft`、`requirements`、`literature`、`data` 五种。
2. “AI 引导梳理”不是第六种 creation_method；它由独立的 `onboarding_mode = direct | guided` 表达，默认 direct。
3. guided 创建最终落库为 `primary_creation_method = idea`、`onboarding_mode = guided`。
4. 快速开始、AI 引导梳理、材料提取、完整专业填写都只能形成 Diagnosis Candidate。
5. Candidate 使用 DiagnosisSession 与 DiagnosisFieldValues 表达；完成 session 不得创建正式 DiagnosisCard。
6. 只有用户明确确认 Candidate 后，才能创建 status=confirmed 的 DiagnosisCard。
7. DiagnosisCard 是项目内部唯一正式项目事实源；AI 讨论、AI 推测和材料提取候选不得直接成为正式事实。
8. 正式诊断卡按版本追加。确认 V2 时保留 V1，并将被替代的正式版本标记为 superseded，不得覆盖或删除。
9. provenance、材料 ID、材料位置、置信度、推荐依据和审计事件必须跨 Candidate 到正式卡保留。
10. 项目创建入口与项目内部诊断卡是两个阶段；AI 引导梳理只是入口策略，不是诊断模块总标题。

> 本文件只保存仍然生效的规则。历史里程碑决定见 `HISTORY_INDEX.md`；与本文件冲突的旧状态文档视为已废弃。

## 项目与初稿

1. `existing_draft` 上传的初稿必须在用户确认导入方案后创建不可静默覆盖的原始 V1。
2. Original File、Parsed Material、Imported Draft Baseline 是三个不同对象：原文件用于恢复，解析材料用于检索，正文基线用于编辑和版本链。
3. 解析成功不等于已经进入编辑器；Sections 和 `source=original` V1 真实存在后才能显示为正文。
4. 无法可靠分章时提供“整篇导入”预览，不得用前端通用六章 fallback 假装识别结果。
5. 摘要、关键词属于真实前置 Section；没有可靠识别时显示待补充，不得生成示例内容并标成原稿。

## AI 对话、Skill 与版本

1. 六个产品 Skill 先创建结构化 ToolIntent 并进入对话，不得点击后直接执行。
2. ToolIntent 必须绑定当前 `projectId`、作用范围、基础版本和用户明确授权的材料。
3. 六个产品 Skill 必须映射到真实内部 Skill 注册表；仅填 Prompt 或只改变前端状态不能标为 READY。
4. AI 对话必须长期持久化；ConversationSession、消息、材料授权、Action Proposal、确认决策、AITask 和候选版本均可追溯。
5. 普通聊天内容不构成执行确认。只有用户明确确认全部或部分 Action Proposal 后才可创建 AITask。
6. AI 修改只能生成候选版本；原始 V1 和当前正式版本不得被静默覆盖。
7. 只有用户采用候选版本后才更新正式版本；拒绝候选时基础版本保持不变。
8. 对话上下文必须来自当前路由/会话的项目，禁止默认 `projects[0]`，也禁止读取其他项目案例数据。
9. 材料默认不发送；只有用户已授权的材料 ID 可以进入本次外部请求，并需在发送前可预览。

## 真实性与状态表达

1. 真实项目不得显示硬编码案例、其他项目数据、Mock 成功提示或 fallback 正文。
2. Development Milestone（M0—M11）仅用于内部开发文档；普通用户 UI 不显示 M 标签。
3. 页面完整、按钮可点或测试通过不等于 READY；必须核对 API、持久化、外部服务、权限和用户闭环。
4. 未完成或未验证的能力必须显示真实状态，不得删除标签后假装完成。

## 模型与 Secret

0. 平台 AI 功能必须有默认底座；当前默认底座为服务端 DeepSeek。用户配置 Provider/Model/API Key 是可选项，不是使用 AI 引导梳理的前置条件。

1. DeepSeek Key 只允许来自服务端本地 Secret 机制，例如被 Git 忽略的 `.dev.vars`。
2. Key 不得进入聊天、前端、LocalStorage、URL、Git、源码、D1 明文字段、日志或错误响应。
3. 未配置凭据时 Runtime Availability 必须是 `CREDENTIAL_REQUIRED`；配置是否有效尚未测试时不得显示 AVAILABLE。
4. 用户必须明确选择 Provider、Model、Agent Role、Thinking Mode、支持时的 Reasoning Effort、最大输出和预算。
5. 不自动开启思考模式、不静默换模型、不自动 fallback、不因失败重复产生外部调用。

## 已废弃或仅属历史的决定

- “当前必须停在 M5、不得进入 M6”的旧阶段描述已经失效，不能继续作为代码范围的当前事实。
- 旧文档中的“全部 M9 完成”“M10 已完成”或早期大量“待实现”均是时间点记录，不能覆盖本文件和 `CURRENT_STATE.md` 的实时审计。
- Mock Provider/Model 名称不是当前有效能力目录，不得作为真实模型可用性的证据。
