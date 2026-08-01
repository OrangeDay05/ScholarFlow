"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  M5_CONVERSATION_SKILL_PROMPTS,
  type M5ActionProposalWorkspace,
  type M5ConversationWorkspace,
} from "@/app/lib/m5-conversation-agent";
import type { M5ActionExecutionWorkspace } from "@/app/lib/m5-action-execution";
import styles from "./RealAiWorkspace.module.css";

type ConversationSkillPrompt = (typeof M5_CONVERSATION_SKILL_PROMPTS)[number];

type ModelConfig = {
  id: string;
  agent_role: string;
  model_id: string;
  thinking_mode: "DISABLED" | "ENABLED";
  reasoning_effort: string | null;
  per_turn_budget: number;
  timeout_ms: number;
  max_output_tokens: number;
};

type ModelWorkspace = {
  configs: ModelConfig[];
  capabilities: Array<{ model_id: string; model_key: string }>;
  platformCredentialConfigured: boolean;
};

type ApiPayload<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string };
};

export function RealAiWorkspace({
  projectId,
  authorizedMaterialIds,
  sectionSlug,
  sectionTitle,
  baseVersionId,
}: {
  projectId: string;
  authorizedMaterialIds: string[];
  sectionSlug: string;
  sectionTitle: string;
  baseVersionId: string | null;
}) {
  const [tab, setTab] = useState<"conversation" | "skills">("conversation");
  const [selectedSkill, setSelectedSkill] = useState<ConversationSkillPrompt>(
    M5_CONVERSATION_SKILL_PROMPTS[0],
  );
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] =
    useState<M5ConversationWorkspace | null>(null);
  const [proposals, setProposals] =
    useState<M5ActionProposalWorkspace | null>(null);
  const [modelWorkspace, setModelWorkspace] = useState<ModelWorkspace | null>(null);
  const [execution, setExecution] = useState<M5ActionExecutionWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("正在读取长期会话……");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiRequest<M5ConversationWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations`,
      ),
      apiRequest<ModelWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/model-orchestration`,
      ),
    ])
      .then(async ([nextConversation, nextModels]) => {
        if (cancelled) return;
        setConversation(nextConversation);
        setModelWorkspace(nextModels);
        setNotice(
          nextConversation.selectedSession
            ? "长期会话已同步。"
            : "当前还没有会话，可以直接输入。",
        );
        if (nextConversation.selectedSession) {
          const nextProposals = await apiRequest<M5ActionProposalWorkspace>(
            `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals?session_id=${encodeURIComponent(nextConversation.selectedSession.id)}`,
          );
          if (!cancelled) {
            setProposals(nextProposals);
            const proposal = nextProposals.proposals.at(-1);
            if (proposal?.status === "CONFIRMED") {
              const nextExecution = await apiRequest<M5ActionExecutionWorkspace>(
                `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals/execution?session_id=${encodeURIComponent(nextConversation.selectedSession.id)}&proposal_id=${encodeURIComponent(proposal.id)}`,
              );
              if (!cancelled) setExecution(nextExecution);
            }
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setNotice(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const conversationConfig = useMemo(
    () =>
      modelWorkspace?.configs.find(
        (config) => config.agent_role === "CONVERSATION_AGENT",
      ) ?? null,
    [modelWorkspace],
  );
  const conversationModel = useMemo(
    () =>
      modelWorkspace?.capabilities.find(
        (capability) => capability.model_id === conversationConfig?.model_id,
      )?.model_key ?? null,
    [conversationConfig, modelWorkspace],
  );
  const reviserConfig = useMemo(
    () => modelWorkspace?.configs.find((config) => config.agent_role === "REVISER") ?? null,
    [modelWorkspace],
  );
  const reviserModel = useMemo(
    () => modelWorkspace?.capabilities.find((capability) => capability.model_id === reviserConfig?.model_id)?.model_key ?? null,
    [modelWorkspace, reviserConfig],
  );
  const canCallModel = Boolean(
    conversationConfig && modelWorkspace?.platformCredentialConfigured,
  );
  const latestProposal = proposals?.proposals.at(-1) ?? null;
  const latestIntent = proposals?.intents.find((intent) => intent.id === latestProposal?.toolIntentId) ?? null;

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    return apiRequest<T>(url, init);
  }

  async function loadConversation(sessionId?: string) {
    try {
      const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const next = await request<M5ConversationWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations${query}`,
      );
      setConversation(next);
      setNotice(next.selectedSession ? "长期会话已同步。" : "当前还没有会话，可以直接输入。 ");
      if (next.selectedSession) await loadProposals(next.selectedSession.id);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function loadProposals(sessionId: string) {
    try {
      const next = await request<M5ActionProposalWorkspace>(
          `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals?session_id=${encodeURIComponent(sessionId)}`,
        );
      setProposals(next);
      const proposal = next.proposals.at(-1);
      if (proposal?.status === "CONFIRMED") await loadExecution(sessionId, proposal.id);
      else setExecution(null);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function loadExecution(sessionId: string, proposalId: string) {
    setExecution(await request<M5ActionExecutionWorkspace>(
      `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals/execution?session_id=${encodeURIComponent(sessionId)}&proposal_id=${encodeURIComponent(proposalId)}`,
    ));
  }

  async function ensureSession(): Promise<string> {
    if (conversation?.selectedSession) return conversation.selectedSession.id;
    const created = await request<{ session: { id: string } }>(
      `/api/m5/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "create_session",
          title: selectedSkill.title,
          activeProductSkill: selectedSkill.productSkill,
          idempotencyKey: `session-${crypto.randomUUID()}`,
        }),
      },
    );
    await loadConversation(created.session.id);
    return created.session.id;
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || busy) return;
    if (!canCallModel) {
      setNotice("请先配置对话 Agent 和服务器平台凭据；本次未调用模型。");
      return;
    }
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      setDraft("");
      await request(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/respond`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            clientMessageId: `user-${crypto.randomUUID()}`,
            clientAgentMessageId: `agent-${crypto.randomUUID()}`,
            content,
          }),
        },
      );
      await loadConversation(sessionId);
      setNotice("回复已保存到长期会话；本次未发送项目材料或章节正文。");
    } catch (error) {
      setNotice(errorMessage(error));
      const sessionId = conversation?.selectedSession?.id;
      if (sessionId) await loadConversation(sessionId);
    } finally {
      setBusy(false);
    }
  }

  async function createProposal() {
    if (busy) return;
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      const warnings = authorizedMaterialIds.length
        ? ["执行前仍需核对每份材料的外传策略和处理副本。"]
        : ["当前未选择材料，执行时不能读取项目材料。"];
      await request(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "create_proposal",
            conversationSessionId: sessionId,
            productSkill: selectedSkill.productSkill,
            operation: draft.trim() || selectedSkill.prompt,
            rationale: `用户从“${selectedSkill.title}”入口整理操作范围。`,
            authorizedMaterialIds,
            title: `准备执行：${selectedSkill.title}`,
            effect: "确认后只进入待执行状态；不会自动覆盖正文或采用候选版本。",
            warnings,
            scopeSectionSlug: selectedSkill.productSkill === "general_revision" ? sectionSlug : null,
            baseVersionId: selectedSkill.productSkill === "general_revision" ? baseVersionId : null,
            excludedScope: "当前章节以外内容；未明确要求修改的事实、数据、术语和引用。",
            idempotencyKey: `proposal-${crypto.randomUUID()}`,
          }),
        },
      );
      await loadProposals(sessionId);
      setNotice("操作提案已保存，必须由你确认后才能进入执行阶段。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || !latestProposal || !reviserConfig || !reviserModel || busy) return;
    setBusy(true);
    try {
      const next = await request<M5ActionExecutionWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals/execution`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "execute",
            confirmedExecution: true,
            conversationSessionId: sessionId,
            proposalId: latestProposal.id,
            configId: reviserConfig.id,
            provider: "DEEPSEEK",
            model: reviserModel,
            agentRole: "REVISER",
            thinkingMode: reviserConfig.thinking_mode,
            reasoningEffort: reviserConfig.reasoning_effort,
            maxOutputTokens: reviserConfig.max_output_tokens,
            budget: reviserConfig.per_turn_budget,
            expectedCalls: 1,
          }),
        },
      );
      setExecution(next);
      setNotice("单次 Reviser 调用已完成，候选版本尚未采用。");
    } catch (error) {
      setNotice(errorMessage(error));
      await loadExecution(sessionId, latestProposal.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function decideCandidate(action: "reject_candidate" | "adopt_candidate") {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || !latestProposal || busy) return;
    setBusy(true);
    try {
      const next = await request<M5ActionExecutionWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals/execution`,
        { method: "POST", body: JSON.stringify({ action, conversationSessionId: sessionId, proposalId: latestProposal.id, idempotencyKey: `${action}-${latestProposal.id}` }) },
      );
      setExecution(next);
      setNotice(action === "adopt_candidate" ? "候选内容已作为新的正式不可变版本采用。" : "候选版本已拒绝，原正式版本保持不变。 ");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function decideProposal(decision: "CONFIRM" | "REJECT") {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || !latestProposal || busy) return;
    setBusy(true);
    try {
      await request(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "decide_proposal",
            conversationSessionId: sessionId,
            proposalId: latestProposal.id,
            decision,
            reason: decision === "REJECT" ? "用户暂不执行。" : null,
            idempotencyKey: `decision-${crypto.randomUUID()}`,
          }),
        },
      );
      await loadProposals(sessionId);
      setNotice(
        decision === "CONFIRM"
          ? "提案已确认；尚未调用 Skill 或修改正文。"
          : "提案已拒绝，不会执行。",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openSkill(skill: ConversationSkillPrompt) {
    setSelectedSkill(skill);
    setDraft(skill.prompt);
    setTab("conversation");
    setNotice(`已带入“${skill.title}”Prompt；发送前仍可修改。`);
  }

  return (
    <section className={styles.workspace} aria-label="AI 工作台">
      <header className={styles.heading}>
        <div><span>AI WORKSPACE</span><h2>AI 工作台</h2></div>
        <strong>{canCallModel ? "真实模型可用" : "等待配置"}</strong>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="AI 工作台模式">
        <button aria-selected={tab === "conversation"} onClick={() => setTab("conversation")} role="tab" type="button">对话 Agent</button>
        <button aria-selected={tab === "skills"} onClick={() => setTab("skills")} role="tab" type="button">Skill 任务</button>
      </div>

      <p className={styles.notice} role="status">{notice}</p>

      {tab === "skills" ? (
        <div className={styles.skillList} role="tabpanel">
          {M5_CONVERSATION_SKILL_PROMPTS.map((skill, index) => (
            <button key={skill.productSkill} onClick={() => openSkill(skill)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{skill.title}</strong>
              <small>打开对话并带入对应 Prompt</small>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.conversation} role="tabpanel">
          <div className={styles.preflight}>
            <span>本次对话</span>
            <strong>{conversationModel ?? "未配置模型"}</strong>
            <small>
              平台额度 · 1 次调用 · 仅发送本次输入与当前会话 · 不发送材料 · 最长等待
              {conversationConfig ? ` ${Math.ceil(conversationConfig.timeout_ms / 1_000)} 秒` : " —"}
            </small>
          </div>

          <div className={styles.messages} aria-live="polite">
            {conversation?.messages.length ? conversation.messages.map((message) => (
              <article data-role={message.role} key={message.id}>
                <span>{message.role === "USER" ? "你" : "AI"}</span>
                <p>{message.content}</p>
              </article>
            )) : <p className={styles.empty}>当前还没有消息。对话 Agent 不会自动展示 Skill Prompt。</p>}
          </div>

          {!canCallModel ? (
            <div className={styles.blocker} role="alert">
              <strong>真实对话尚未就绪</strong>
              <span>请配置当前项目的对话 Agent，并由部署环境提供服务器平台凭据。</span>
              <Link href={`/settings/models?project_id=${encodeURIComponent(projectId)}`}>打开模型与 API 设置</Link>
            </div>
          ) : null}

          <label className={styles.composer}>
            <span>告诉 AI 你想推进什么</span>
            <textarea maxLength={12_000} onChange={(event) => setDraft(event.target.value)} placeholder="输入你的问题；从 Skill 任务进入时，对应 Prompt 会出现在这里。" value={draft} />
          </label>
          <div className={styles.actions}>
            <button disabled={!draft.trim() || !canCallModel || busy} onClick={sendMessage} type="button">{busy ? "处理中……" : "发送"}</button>
            <button disabled={busy} onClick={createProposal} type="button">整理为操作提案</button>
          </div>

          {latestProposal ? (
            <article className={styles.proposal}>
              <span>{latestProposal.status}</span>
              <strong>{latestProposal.title}</strong>
              <p>{latestProposal.effect}</p>
              {latestProposal.warnings.map((warning) => <small key={warning}>{warning}</small>)}
              {latestProposal.status === "AWAITING_USER_CONFIRMATION" ? (
                <div><button disabled={busy} onClick={() => decideProposal("CONFIRM")} type="button">确认提案</button><button disabled={busy} onClick={() => decideProposal("REJECT")} type="button">暂不执行</button></div>
              ) : null}
              {latestProposal.status === "CONFIRMED" && latestIntent?.productSkill === "general_revision" ? (
                <div className={styles.executionGate}>
                  <dl>
                    <div><dt>修改范围</dt><dd>{execution?.intent.sectionTitle ?? sectionTitle}</dd></div>
                    <div><dt>基础版本</dt><dd>{execution?.intent.baseVersionId ?? baseVersionId ?? "未绑定"}</dd></div>
                    <div><dt>材料范围</dt><dd>{authorizedMaterialIds.length ? `${authorizedMaterialIds.length} 份已授权材料` : "不发送材料"}</dd></div>
                    <div><dt>Agent Role</dt><dd>REVISER</dd></div>
                    <div><dt>Provider / Model</dt><dd>{reviserModel ? `DeepSeek / ${reviserModel}` : "未配置"}</dd></div>
                    <div><dt>Thinking Mode</dt><dd>{reviserConfig?.thinking_mode ?? "未配置"}</dd></div>
                    <div><dt>Reasoning Effort</dt><dd>{reviserConfig?.reasoning_effort ?? "不适用"}</dd></div>
                    <div><dt>最大输出</dt><dd>{reviserConfig ? `${reviserConfig.max_output_tokens} tokens` : "未配置"}</dd></div>
                    <div><dt>预计调用</dt><dd>1 次；无自动重试或 Fallback</dd></div>
                    <div><dt>预算上限</dt><dd>{reviserConfig ? String(reviserConfig.per_turn_budget) : "未配置"}</dd></div>
                  </dl>
                  {!execution?.task ? <button disabled={busy || !reviserConfig || !reviserModel || !modelWorkspace?.platformCredentialConfigured || !baseVersionId} onClick={executeProposal} type="button">确认配置并执行 1 次</button> : null}
                </div>
              ) : null}
            </article>
          ) : null}

          {execution?.task ? (
            <article className={styles.executionResult}>
              <span>任务 {execution.task.status} · 调用 {execution.task.callsUsed}/{execution.task.maxCalls}</span>
              <strong>AITask {execution.task.id}</strong>
              {execution.candidate ? (
                <>
                  <p>基础版本：{execution.intent.baseVersionId}</p>
                  <p>候选版本：{execution.candidate.id}</p>
                  <div className={styles.diff} aria-label="原版本与候选版本差异">
                    {execution.diff.map((item, index) => (
                      <div data-kind={item.kind} key={`${item.kind}-${index}`}>
                        <b>{item.kind}</b>
                        {item.before !== null ? <del>{item.before}</del> : null}
                        {item.after !== null ? <ins>{item.after}</ins> : null}
                      </div>
                    ))}
                  </div>
                  <div>
                    <button disabled={busy || execution.candidate.rejected || execution.candidate.adopted} onClick={() => decideCandidate("reject_candidate")} type="button">拒绝候选版本</button>
                    <button disabled={busy || execution.candidate.adopted} onClick={() => decideCandidate("adopt_candidate")} type="button">确认采用</button>
                  </div>
                  {execution.candidate.rejected ? <small>已拒绝；原版本未改变。仍可采用同一候选，不会再次调用模型。</small> : null}
                  {execution.candidate.adopted ? <small>已采用为正式版本：{execution.candidate.formalVersionId}</small> : null}
                </>
              ) : <p>尚未生成候选版本；失败不会修改基础版本。</p>}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败。";
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload = (await response.json()) as ApiPayload<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "请求失败。");
  }
  return payload.data;
}
