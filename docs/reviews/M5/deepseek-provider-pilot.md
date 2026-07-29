# M5-B4 DeepSeek Provider Pilot 审核记录

## 范围

本检查点建立通用 Provider、Credential、Model、Capability、Inference Configuration、Agent Role 与 Task Selection 分层，并实现 DeepSeek 专用 Adapter。未接入其他真实 Provider，未部署。

## 当前能力基线

- 当前可选模型：`deepseek-v4-flash`、`deepseek-v4-pro`。
- `deepseek-chat`、`deepseek-reasoner` 仅作为 `RETIRED` 兼容记录，新任务会被拒绝，系统不会静默替换。
- 思考模式显式发送 `thinking.type=enabled|disabled`。
- DeepSeek 仅展示 `HIGH`、`MAX`；不支持的强度返回 `MODEL_CONFIGURATION_UNSUPPORTED`。
- 思考模式下移除不生效的采样参数。
- 基线来自 DeepSeek 官方 [模型与价格](https://api-docs.deepseek.com/quick_start/pricing/) 和 [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode) 文档，能力版本与价格版本均按日期冻结。

## 安全边界

- Pilot 只从服务器环境 `DEEPSEEK_API_KEY` 读取平台凭据。
- `.dev.vars` 被 Git 忽略；示例文件只有空字段名。
- Pilot API 不接受 API Key、任意 Base URL、项目材料或自定义测试 Prompt。
- 管理员每次外部调用必须单独确认，固定测试提示不含项目或个人数据。
- 原始 `reasoning_content` 不进入响应、普通消息或日志；仅返回是否产生、字符数、Token 数和工具名。
- 思考工具调用所需推理内容仅在 Adapter 内的当前 Run 临时保存，五分钟过期且使用一次后删除。
- Fallback 仅保存为候选引用，不会自动执行；预算暂停不会自动恢复。

## 数据与 API

迁移 `0015_talented_justice.sql` 新增：

- `model_capability_versions`
- `provider_catalog_syncs`
- `agent_role_model_configs`
- `resolved_model_config_snapshots`
- `model_pricing_versions`
- `provider_run_records`

新增路由：

- `GET/POST /api/m5/providers/deepseek/pilot`
- `GET/PUT /api/m5/projects/:projectId/model-orchestration`

角色配置按用户和项目隔离；正式任务必须显式确认后才创建解析快照。快照保存最终生效参数、忽略参数、能力版本、价格版本和凭据引用，不保存密钥。

## 验证结果

- TypeScript：通过。
- 目标 ESLint：通过。
- DeepSeek Fake Adapter：12 通过。
- 真实 DeepSeek Integration Test：默认跳过，未执行；仅在 `RUN_DEEPSEEK_INTEGRATION_TESTS=true` 且显式选择一个模型和模式时运行。
- 全仓测试：163 项，156 通过、7 跳过、0 失败。
- Fresh D1 migration：0000→0015 全部成功；78 张表。
- Vinext build：通过。
- `git diff --check`：通过。
- Secret 扫描：未发现真实 Key 模式。

## 已知限制

- 本轮没有真实 DeepSeek 凭据，因此未产生真实 Token、费用或 Provider 请求 ID。
- 价格以版本化 Catalog 保存；若官方价格变化，新增版本，不覆盖历史。
- 未接入 OpenAI、Anthropic 或 Gemini 的真实 Adapter。
- 未执行生产迁移或部署。
