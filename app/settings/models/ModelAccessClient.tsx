"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import {
  availableModelOptions,
  conflictOpinions,
  mockUserCredential,
  modelFailureStates,
  modelRoles,
  orchestrationModes,
  orchestrationPlan,
  orchestrationRules,
  platformCredential,
  securityRequirements,
  type CredentialStatus,
  type ModelRole,
  type OrchestrationMode,
} from "@/app/lib/model-orchestration-mock";
import styles from "./models.module.css";
import DeepSeekPilotPanel from "./DeepSeekPilotPanel";

const roleModelDefaults: Record<ModelRole, string> = {
  GENERATOR: "openai-gpt-5-2",
  REVIEWER: "deepseek-v4-pro",
  VERIFIER: "anthropic-claude",
  REVISER: "openai-gpt-5-2",
  ROUTER: "deepseek-v4-flash",
};

const credentialStatusCopy: Record<CredentialStatus, string> = {
  NOT_CONFIGURED: "尚未配置",
  READY: "演示连接可用",
  TESTING: "正在测试 · Mock",
  INVALID: "Key 无效 · Mock",
  DISABLED: "已禁用",
  DELETED: "已删除",
};

export default function ModelAccessClient() {
  const [mode, setMode] = useState<OrchestrationMode>("STANDARD");
  const [roleModels, setRoleModels] =
    useState<Record<ModelRole, string>>(roleModelDefaults);
  const [credentialStatus, setCredentialStatus] =
    useState<CredentialStatus>("READY");
  const [provider, setProvider] = useState("Anthropic");
  const [projectScope, setProjectScope] = useState("demo");
  const [allowedRoles, setAllowedRoles] = useState<ModelRole[]>([
    "REVIEWER",
    "VERIFIER",
  ]);
  const [allowedModels, setAllowedModels] = useState(["anthropic-claude"]);
  const [credentialVisible, setCredentialVisible] = useState(true);
  const [notice, setNotice] = useState(
    "已加载安全演示凭据。页面不会接收、发送或保存真实 API Key。",
  );

  const selectedMode =
    orchestrationModes.find((item) => item.id === mode) ??
    orchestrationModes[0];

  const visibleRoles = useMemo(() => {
    if (mode === "STANDARD") return ["GENERATOR", "REVIEWER"] as ModelRole[];
    if (mode === "STRICT") {
      return ["GENERATOR", "REVIEWER", "VERIFIER"] as ModelRole[];
    }
    return ["ROUTER", "GENERATOR", "REVIEWER", "VERIFIER"] as ModelRole[];
  }, [mode]);

  function selectedModel(role: ModelRole) {
    return (
      availableModelOptions.find((item) => item.id === roleModels[role]) ??
      availableModelOptions[0]
    );
  }

  function toggleRole(role: ModelRole) {
    setAllowedRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  }

  function toggleModel(id: string) {
    setAllowedModels((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function testConnection() {
    if (!credentialVisible || credentialStatus === "DISABLED") return;
    setCredentialStatus("TESTING");
    setNotice("正在使用演示状态测试连接；没有向供应商发送请求。");
    window.setTimeout(() => {
      setCredentialStatus("READY");
      setNotice("演示连接测试完成。真实连接测试将在 M5 由服务端执行。");
    }, 650);
  }

  function deleteCredential() {
    setCredentialVisible(false);
    setCredentialStatus("DELETED");
    setNotice("演示凭据已从当前页面移除；没有真实密钥或服务端记录被删除。");
  }

  return (
    <AppShell
      eyebrow="Model orchestration · M3 Mock"
      title="模型与 API"
      description="选择平台模型或用户凭据，并为生成、审阅和验证分别分配角色。事实确认始终回到授权材料。"
      action={
        <Link className={styles.backLink} href="/projects/demo/editor?section=introduction">
          返回 AI 工作台 →
        </Link>
      }
    >
      <div className={styles.mockNotice}>
        <MockBadge>M3 前端 Mock</MockBadge>
        <span>
          不接收真实 API Key，不调用供应商，不消耗额度，不修改数据库；真实加密与路由推迟到 M5。
        </span>
      </div>

      <DeepSeekPilotPanel />

      <section className={styles.credentialChoice}>
        <article className={styles.platformCard}>
          <div>
            <span>默认</span>
            <h2>平台提供模型</h2>
          </div>
          <p>用户消耗平台额度；凭据由平台托管，前端永远看不到密钥。</p>
          <dl>
            <div>
              <dt>凭据类型</dt>
              <dd>{platformCredential.credential_type}</dd>
            </div>
            <div>
              <dt>可用模型</dt>
              <dd>OpenAI + DeepSeek · Mock</dd>
            </div>
            <div>
              <dt>额度</dt>
              <dd>演示余额 82%</dd>
            </div>
          </dl>
        </article>
        <article className={styles.userKeyCard}>
          <div>
            <span>高级用户</span>
            <h2>使用自己的 API Key</h2>
          </div>
          <p>用户决定供应商、模型、项目范围和可承担角色；当前仅展示安全配置流程。</p>
          <dl>
            <div>
              <dt>凭据类型</dt>
              <dd>{mockUserCredential.credential_type}</dd>
            </div>
            <div>
              <dt>当前范围</dt>
              <dd>演示项目</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{credentialStatusCopy[credentialStatus]}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.modeSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>01 / 编排模式</span>
            <h2>模型多，不等于事实更可靠。</h2>
          </div>
          <p>每种模式同时限制模型数量、总调用次数、超时和停止条件。</p>
        </header>
        <div className={styles.modeGrid} role="radiogroup" aria-label="多模型编排模式">
          {orchestrationModes.map((item) => (
            <button
              aria-checked={mode === item.id}
              className={mode === item.id ? styles.modeActive : styles.modeButton}
              key={item.id}
              onClick={() => setMode(item.id)}
              role="radio"
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.modelCount}</strong>
              <p>{item.description}</p>
              <small>
                最多 {item.maxCalls} 次调用 · 禁止无限循环
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.assignmentSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>02 / 角色分配</span>
            <h2>{selectedMode.label} · {selectedMode.modelCount}</h2>
          </div>
          <p>角色分别记录；审阅和验证不会直接修改生成版本。</p>
        </header>
        <div className={styles.assignmentTable}>
          <header>
            <span>任务角色</span>
            <span>模型</span>
            <span>凭据来源</span>
            <span>数据处理方</span>
          </header>
          {visibleRoles.map((role) => {
            const roleContract = modelRoles.find((item) => item.id === role)!;
            const model = selectedModel(role);
            return (
              <article key={role}>
                <div>
                  <strong>{roleContract.label}</strong>
                  <code>{role}</code>
                  <small>{roleContract.outputBoundary}</small>
                </div>
                <label>
                  <span>选择模型</span>
                  <select
                    value={roleModels[role]}
                    onChange={(event) =>
                      setRoleModels((current) => ({
                        ...current,
                        [role]: event.target.value,
                      }))
                    }
                  >
                    {availableModelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.provider} · {option.model}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <strong>{model.credentialType}</strong>
                  <small>
                    {model.credentialType === "USER_CREDENTIAL"
                      ? mockUserCredential.masked_key
                      : "平台额度"}
                  </small>
                </div>
                <div>
                  <strong>{model.processor}</strong>
                  <small>仅发送本任务授权材料</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.configurationGrid}>
        <section className={styles.keyPanel}>
          <header>
            <div>
              <span>03 / 用户 API Key</span>
              <h2>凭据设置</h2>
            </div>
            <strong>{credentialStatusCopy[credentialStatus]}</strong>
          </header>

          {credentialVisible ? (
            <>
              <div className={styles.keyWarning}>
                <strong>不要粘贴真实 Key</strong>
                <span>当前输入框被禁用，只展示掩码和交互状态。</span>
              </div>
              <div className={styles.keyForm}>
                <label>
                  <span>供应商</span>
                  <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                    <option>Anthropic</option>
                    <option>OpenAI</option>
                    <option>DeepSeek</option>
                    <option>Google</option>
                  </select>
                </label>
                <label>
                  <span>API Key · M3 禁止真实输入</span>
                  <input
                    aria-label="API Key 演示输入框"
                    disabled
                    type="password"
                    value="mock-key-never-sent"
                    readOnly
                  />
                  <small>显示：{mockUserCredential.masked_key}</small>
                </label>
                <label>
                  <span>项目范围</span>
                  <select
                    value={projectScope}
                    onChange={(event) => setProjectScope(event.target.value)}
                  >
                    <option value="demo">仅当前项目</option>
                    <option value="all-mock">我的全部项目 · Mock</option>
                  </select>
                </label>
              </div>

              <div className={styles.permissionBlock}>
                <span>允许承担的任务角色</span>
                <div>
                  {modelRoles.map((role) => (
                    <label key={role.id}>
                      <input
                        checked={allowedRoles.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        type="checkbox"
                      />
                      {role.id}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.permissionBlock}>
                <span>允许使用的模型</span>
                <div>
                  {availableModelOptions
                    .filter((model) => model.provider === provider)
                    .map((model) => (
                      <label key={model.id}>
                        <input
                          checked={allowedModels.includes(model.id)}
                          onChange={() => toggleModel(model.id)}
                          type="checkbox"
                        />
                        {model.model}
                      </label>
                    ))}
                </div>
              </div>

              <div className={styles.keyActions}>
                <button
                  disabled={credentialStatus === "DISABLED"}
                  onClick={testConnection}
                  type="button"
                >
                  测试连接 · Mock
                </button>
                <button
                  onClick={() => {
                    const disabled = credentialStatus === "DISABLED";
                    setCredentialStatus(disabled ? "READY" : "DISABLED");
                    setNotice(disabled ? "演示凭据已重新启用。" : "演示凭据已禁用。");
                  }}
                  type="button"
                >
                  {credentialStatus === "DISABLED" ? "重新启用" : "禁用 Key"}
                </button>
                <button className={styles.dangerButton} onClick={deleteCredential} type="button">
                  删除 Key
                </button>
              </div>
            </>
          ) : (
            <div className={styles.emptyKey}>
              <strong>尚未添加用户凭据</strong>
              <p>添加供应商后仍只能加载演示 Key，不会出现真实密钥输入。</p>
              <button
                onClick={() => {
                  setCredentialVisible(true);
                  setCredentialStatus("READY");
                  setNotice("已重新加载安全演示凭据。");
                }}
                type="button"
              >
                添加供应商 · 加载演示 Key
              </button>
            </div>
          )}
          <div className={styles.notice} role="status">{notice}</div>
        </section>

        <aside className={styles.securityPanel}>
          <header>
            <span>安全边界</span>
            <h2>前端只看掩码与授权范围</h2>
          </header>
          <ul>
            {securityRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <dl>
            <div>
              <dt>用户隔离</dt>
              <dd>owner_user_id</dd>
            </div>
            <div>
              <dt>组织隔离</dt>
              <dd>organization_id</dd>
            </div>
            <div>
              <dt>真实密文引用</dt>
              <dd>M3 为 null</dd>
            </div>
          </dl>
        </aside>
      </div>

      <section className={styles.preflightSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>04 / 执行前披露</span>
            <h2>当前任务 · 引言通用修改</h2>
          </div>
          <p>用户确认后才执行；当前只展示计划，不会调用模型。</p>
        </header>
        <div className={styles.preflightGrid}>
          <article>
            <span>生成模型</span>
            <strong>{selectedModel("GENERATOR").provider} · {selectedModel("GENERATOR").model}</strong>
            <small>GENERATOR · 平台额度</small>
          </article>
          <article>
            <span>审阅模型</span>
            <strong>{selectedModel("REVIEWER").provider} · {selectedModel("REVIEWER").model}</strong>
            <small>REVIEWER · 独立报告</small>
          </article>
          <article>
            <span>验证模型</span>
            <strong>{mode === "STANDARD" ? "标准模式不执行" : `${selectedModel("VERIFIER").provider} · ${selectedModel("VERIFIER").model}`}</strong>
            <small>VERIFIER · 只生成验证报告</small>
          </article>
          <article>
            <span>预计调用</span>
            <strong>最多 {selectedMode.maxCalls} 次</strong>
            <small>模型之间不得无限循环</small>
          </article>
          <article>
            <span>预计发送资料</span>
            <strong>2 份授权材料</strong>
            <small>课程要求 + 参考论文</small>
          </article>
          <article>
            <span>数据处理方</span>
            <strong>{visibleRoles.map((role) => selectedModel(role).provider).filter((value, index, array) => array.indexOf(value) === index).join("、")}</strong>
            <small>仅本任务范围 · Mock</small>
          </article>
          <article>
            <span>预计耗时</span>
            <strong>{orchestrationPlan.estimated_duration}</strong>
            <small>总超时 {orchestrationPlan.timeout_seconds} 秒</small>
          </article>
          <article>
            <span>失败降级</span>
            <strong>保留已成功产物</strong>
            <small>{orchestrationPlan.fallback_plan}</small>
          </article>
        </div>
        <div className={styles.stopConditions}>
          <strong>停止条件</strong>
          {orchestrationPlan.stop_conditions.map((condition) => (
            <span key={condition}>{condition}</span>
          ))}
        </div>
      </section>

      <section className={styles.conflictSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>05 / 意见合并与冲突</span>
            <h2>相同问题合并，模型来源保留。</h2>
          </div>
          <p>两个模型意见一致也不能替代原始材料核验。</p>
        </header>
        <div className={styles.conflictGrid}>
          {conflictOpinions.map((opinion) => (
            <article key={opinion.id}>
              <header>
                <span>{opinion.role}</span>
                <strong>{opinion.provider} · {opinion.model}</strong>
              </header>
              <p>{opinion.conclusion}</p>
              <dl>
                <div>
                  <dt>依据</dt>
                  <dd>{opinion.evidence_basis}</dd>
                </div>
                <div>
                  <dt>材料位置</dt>
                  <dd>{opinion.source_locations.join("；")}</dd>
                </div>
                <div>
                  <dt>置信度</dt>
                  <dd>{opinion.confidence}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className={styles.userDecision}>
          <strong>冲突尚未解决 · 等待用户决定</strong>
          <span>系统可以建议，但不得自动把任一模型意见写成最终事实。</span>
          <button type="button">查看原始材料后决定 · Mock</button>
        </div>
      </section>

      <section className={styles.failureSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>06 / 失败状态</span>
            <h2>部分失败，不能伪装成全部通过。</h2>
          </div>
          <p>成功产物保留，失败角色和整体状态分别记录。</p>
        </header>
        <div className={styles.failureGrid}>
          {modelFailureStates.map((failure) => (
            <article key={failure.id}>
              <code>{failure.id}</code>
              <strong>{failure.label}</strong>
              <p>{failure.retainedArtifact}</p>
              <small>{failure.taskOutcome}</small>
            </article>
          ))}
        </div>
      </section>

      <details className={styles.rulesPanel}>
        <summary>查看多模型编排的九条硬规则</summary>
        <ol>
          {orchestrationRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </details>
    </AppShell>
  );
}
