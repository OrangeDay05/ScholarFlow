"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  M5_CONVERSATION_SKILL_PROMPTS,
  type M5ActionProposalWorkspace,
  type M5ConversationWorkspace,
} from "@/app/lib/m5-conversation-agent";
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
}: {
  projectId: string;
  authorizedMaterialIds: string[];
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
          if (!cancelled) setProposals(nextProposals);
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
  const canCallModel = Boolean(
    conversationConfig && modelWorkspace?.platformCredentialConfigured,
  );
  const latestProposal = proposals?.proposals.at(-1) ?? null;

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
      setProposals(
        await request<M5ActionProposalWorkspace>(
          `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals?session_id=${encodeURIComponent(sessionId)}`,
        ),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
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
              <Link href="/settings/models">打开模型与 API 设置</Link>
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
