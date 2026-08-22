"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DiagnosisDraft, FileQueueStatus } from "@/app/lib/MockWorkspaceContext";
import {
  M5_CONVERSATION_SKILL_PROMPTS,
  type M5ActionProposalWorkspace,
  type M5ConversationWorkspace,
} from "@/app/lib/m5-conversation-agent";
import type { M5ActionExecutionWorkspace } from "@/app/lib/m5-action-execution";
import type { ContextSnapshotView } from "@/app/lib/context-engine/types";
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
  availableMaterials,
  diagnosis,
  diagnosisStatus,
  sectionSlug,
  sectionTitle,
  baseVersionId,
}: {
  projectId: string;
  authorizedMaterialIds: string[];
  availableMaterials: Array<{ id: string; name: string; kind: string; status: FileQueueStatus }>;
  diagnosis: DiagnosisDraft;
  diagnosisStatus: "draft" | "confirmed" | "updated";
  sectionSlug: string;
  sectionTitle: string;
  baseVersionId: string | null;
}) {
  const [tab, setTab] = useState<"conversation" | "skills">("conversation");
  const [activeProductSkill, setActiveProductSkill] = useState<ConversationSkillPrompt["productSkill"] | null>(null);
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] =
    useState<M5ConversationWorkspace | null>(null);
  const [proposals, setProposals] =
    useState<M5ActionProposalWorkspace | null>(null);
  const [modelWorkspace, setModelWorkspace] = useState<ModelWorkspace | null>(null);
  const [execution, setExecution] = useState<M5ActionExecutionWorkspace | null>(null);
  const [contextSnapshot, setContextSnapshot] = useState<ContextSnapshotView | null>(null);
  const [turnAuthorizedMaterialIds, setTurnAuthorizedMaterialIds] = useState<string[]>(authorizedMaterialIds);
  const [readingExpanded, setReadingExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("正在读取长期会话……");
  const [proposalModalId, setProposalModalId] = useState<string | null>(null);
  const [proposalListOpen, setProposalListOpen] = useState(false);
  const [deleteProposalId, setDeleteProposalId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const pendingUserScrollRef = useRef<string | null>(null);

  useEffect(() => {
    const clientMessageId = pendingUserScrollRef.current;
    const container = messagesRef.current;
    if (!clientMessageId || !container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-client-message-id="${clientMessageId}"]`,
    );
    if (!target) return;
    const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top, behavior: "smooth" });
    pendingUserScrollRef.current = null;
  }, [conversation?.messages]);

  useEffect(() => {
    const openDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; materialId?: string }>).detail;
      if (!detail?.prompt) return;
      setTab("conversation");
      setActiveProductSkill(null);
      setDraft(detail.prompt);
      setReadingExpanded(true);
      if (detail.materialId && availableMaterials.some((material) => material.id === detail.materialId)) {
        setTurnAuthorizedMaterialIds((current) => current.includes(detail.materialId!) ? current : [...current, detail.materialId!]);
      }
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(`textarea[name="ai-conversation-draft"]`)?.focus(), 0);
    };
    window.addEventListener("scholarflow:ai-draft", openDraft);
    return () => window.removeEventListener("scholarflow:ai-draft", openDraft);
  }, [availableMaterials]);

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
          const snapshotPayload = await apiRequest<{ snapshot: ContextSnapshotView | null }>(
            `/api/m5/projects/${encodeURIComponent(projectId)}/context-snapshots?conversationSessionId=${encodeURIComponent(nextConversation.selectedSession.id)}`,
          );
          if (!cancelled) setContextSnapshot(snapshotPayload.snapshot);
          const nextProposals = await apiRequest<M5ActionProposalWorkspace>(
            `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals?session_id=${encodeURIComponent(nextConversation.selectedSession.id)}`,
          );
          if (!cancelled) {
            setProposals(nextProposals);
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

  useEffect(() => {
    if (!readingExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReadingExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [readingExpanded]);

  const conversationConfig = useMemo(
    () =>
      modelWorkspace?.configs.find(
        (config) => config.agent_role === "CONVERSATION_AGENT",
      ) ?? null,
    [modelWorkspace],
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
  const displayedProposal = proposals?.proposals.find((proposal) => proposal.id === proposalModalId) ?? null;
  const displayedIntent = proposals?.intents.find((intent) => intent.id === displayedProposal?.toolIntentId) ?? null;
  const activeSkill = useMemo(
    () => M5_CONVERSATION_SKILL_PROMPTS.find((skill) => skill.productSkill === activeProductSkill) ?? null,
    [activeProductSkill],
  );

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
      if (proposalModalId && !next.proposals.some((proposal) => proposal.id === proposalModalId)) {
        setProposalModalId(null);
        setExecution(null);
      }
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
          title: activeSkill?.title ?? "项目对话",
          activeProductSkill: activeSkill?.productSkill ?? null,
          idempotencyKey: `session-${crypto.randomUUID()}`,
        }),
      },
    );
    await loadConversation(created.session.id);
    return created.session.id;
  }

  async function sendMessage() {
    const content = draft.trim() || activeSkill?.activationMessage || "";
    if (!content || busy) return;
    if (!canCallModel) {
      setNotice("请先配置对话 Agent 和服务器平台凭据；本次未调用模型。");
      return;
    }
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      const clientMessageId = `user-${crypto.randomUUID()}`;
      pendingUserScrollRef.current = clientMessageId;
      setDraft("");
      const response = await request<{ contextSnapshot: ContextSnapshotView }>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/respond`,
        {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            clientMessageId,
            clientAgentMessageId: `agent-${crypto.randomUUID()}`,
            content,
            productSkill: activeProductSkill,
            authorizedMaterialIds: turnAuthorizedMaterialIds,
            workspaceContext: {
              sectionSlug,
              sectionTitle,
              diagnosisStatus,
              diagnosis,
              availableMaterials,
            },
          }),
        },
      );
      setContextSnapshot(response.contextSnapshot);
      await loadConversation(sessionId);
      setNotice(`回复已保存到长期会话；已同步当前章节、诊断卡和 ${availableMaterials.length} 份材料元数据${turnAuthorizedMaterialIds.length ? `，并检索 ${turnAuthorizedMaterialIds.length} 份已授权材料` : "；未读取未授权材料正文"}。`);
    } catch (error) {
      const message = errorMessage(error);
      setDraft(content);
      const sessionId = conversation?.selectedSession?.id;
      if (sessionId) await loadConversation(sessionId);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function createProposal() {
    if (busy || !activeSkill) return;
    setBusy(true);
    try {
      const sessionId = await ensureSession();
      const fallsBackToWriting =
        activeSkill.productSkill === "general_revision" && !baseVersionId;
      const proposalSkill = fallsBackToWriting
        ? M5_CONVERSATION_SKILL_PROMPTS.find(
            (skill) => skill.productSkill === "chapter_writing",
          ) ?? activeSkill
        : activeSkill;
      const warnings = [
        ...(fallsBackToWriting
          ? ["当前章节尚无基础正文，不能执行修订；本提案已按章节完整写作处理。"]
          : []),
        ...(turnAuthorizedMaterialIds.length
        ? ["执行前仍需核对每份材料的外传策略和处理副本。"]
        : ["当前未选择材料，执行时不能读取项目材料。"]),
      ];
      const created = await request<{ proposal: { id: string } }>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "create_proposal",
            conversationSessionId: sessionId,
            productSkill: proposalSkill.productSkill,
            operation: draft.trim() || proposalSkill.prompt,
            rationale: fallsBackToWriting
              ? `用户从“${activeSkill.title}”入口整理操作范围；当前章节无基础版本，改为“${proposalSkill.title}”。`
              : `用户从“${activeSkill.title}”入口整理操作范围。`,
            authorizedMaterialIds: turnAuthorizedMaterialIds,
            title: `准备执行：${proposalSkill.title}`,
            effect: fallsBackToWriting
              ? `针对当前章节《${sectionTitle}》生成完整章节候选；确认后只进入待执行状态，不会自动覆盖正文。`
              : "确认后只进入待执行状态；不会自动覆盖正文或采用候选版本。",
            warnings,
            scopeSectionSlug: ["general_revision", "chapter_writing"].includes(proposalSkill.productSkill) ? sectionSlug : null,
            baseVersionId: ["general_revision", "chapter_writing"].includes(proposalSkill.productSkill) ? baseVersionId : null,
            excludedScope: "当前章节以外内容；未明确要求修改的事实、数据、术语和引用。",
            idempotencyKey: `proposal-${crypto.randomUUID()}`,
          }),
        },
      );
      await loadProposals(sessionId);
      setProposalModalId(created.proposal.id);
      setProposalListOpen(false);
      setExecution(null);
      setNotice(
        fallsBackToWriting
          ? "当前章节没有基础正文，已改为章节完整写作提案并打开确认弹窗。"
          : "操作提案已保存，必须由你确认后才能进入执行阶段。",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || !displayedProposal || !reviserConfig || !reviserModel || busy) return;
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
            proposalId: displayedProposal.id,
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
      await loadExecution(sessionId, displayedProposal.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function decideCandidate(action: "reject_candidate" | "adopt_candidate") {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || !displayedProposal || busy) return;
    setBusy(true);
    try {
      const next = await request<M5ActionExecutionWorkspace>(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals/execution`,
        { method: "POST", body: JSON.stringify({ action, conversationSessionId: sessionId, proposalId: displayedProposal.id, idempotencyKey: `${action}-${displayedProposal.id}` }) },
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
    if (!sessionId || !displayedProposal || busy) return;
    setBusy(true);
    try {
      await request(
        `/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "decide_proposal",
            conversationSessionId: sessionId,
            proposalId: displayedProposal.id,
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

  async function openProposal(proposalId: string) {
    setProposalModalId(proposalId);
    setProposalListOpen(false);
    setDeleteProposalId(null);
    const sessionId = conversation?.selectedSession?.id;
    const proposal = proposals?.proposals.find((item) => item.id === proposalId);
    if (sessionId && proposal?.status === "CONFIRMED") {
      await loadExecution(sessionId, proposalId).catch((error) => setNotice(errorMessage(error)));
    } else {
      setExecution(null);
    }
  }

  async function deleteProposal(proposalId: string) {
    const sessionId = conversation?.selectedSession?.id;
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await request(`/api/m5/projects/${encodeURIComponent(projectId)}/conversations/proposals`, {
        method: "POST",
        body: JSON.stringify({ action: "delete_proposal", conversationSessionId: sessionId, proposalId }),
      });
      setDeleteProposalId(null);
      if (proposalModalId === proposalId) setProposalModalId(null);
      await loadProposals(sessionId);
      setNotice("操作提案已彻底删除。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openSkill(skill: ConversationSkillPrompt) {
    setActiveProductSkill(skill.productSkill);
    setTab("conversation");
    setNotice(`已启用“${skill.title}”Skill；你可以直接发送，也可以补充具体要求。`);
  }

  return (
    <section className={`${styles.workspace} ${readingExpanded ? styles.workspaceExpanded : ""}`} aria-label="AI 工作台">
      <header className={styles.heading}>
        <span>AI WORKSPACE</span>
        <div className={styles.headingActions}>
          <strong>{canCallModel ? "真实模型可用" : "等待配置"}</strong>
          <button
            aria-pressed={readingExpanded}
            onClick={() => setReadingExpanded((current) => !current)}
            type="button"
          >
            {readingExpanded ? "返回编辑器" : "展开阅读"}
          </button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="AI 工作台模式">
        <button aria-selected={tab === "conversation"} onClick={() => setTab("conversation")} role="tab" type="button">对话 Agent</button>
        <button aria-selected={tab === "skills"} onClick={() => setTab("skills")} role="tab" type="button">Skill 任务</button>
      </div>

      {tab === "skills" ? (
        <div className={styles.skillList} role="tabpanel">
          {M5_CONVERSATION_SKILL_PROMPTS.map((skill, index) => (
            <button key={skill.productSkill} onClick={() => openSkill(skill)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{skill.title}</strong>
              <small>{skill.description}</small>
              <small>{skill.sourceSkills}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.conversation} role="tabpanel">
          <div className={styles.messages} aria-live="polite" ref={messagesRef}>
            {conversation?.messages.length ? conversation.messages.map((message) => (
              <article className={isCompleteSkillArtifact(message.content) ? styles.completeArtifact : undefined} data-client-message-id={message.clientMessageId} data-role={message.role} key={message.id}>
                <span>{message.role === "USER" ? "你" : "AI"}</span>
                <MarkdownMessage content={message.content} />
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

          <div className={styles.inputDock}>
            <div className={styles.composerTools}>
              <details className={styles.compactContext}>
                <summary>材料与上下文 · {turnAuthorizedMaterialIds.length} 份</summary>
                <fieldset className={styles.materialAuthorization}>
                  <legend>本轮允许 AI 读取</legend>
                  {availableMaterials.map((material) => {
                    const readable = material.status === "success";
                    const checked = turnAuthorizedMaterialIds.includes(material.id);
                    return (
                      <label key={material.id}>
                        <input
                          checked={checked}
                          disabled={!readable || busy}
                          onChange={() => setTurnAuthorizedMaterialIds((current) => current.includes(material.id) ? current.filter((id) => id !== material.id) : [...current, material.id])}
                          type="checkbox"
                        />
                        <span><strong>{material.name}</strong><small>{material.kind} · {readable ? "可检索" : "尚不可读"}</small></span>
                      </label>
                    );
                  })}
                  <p>{contextSnapshot ? `${contextSnapshot.retrievalMode} · ${contextSnapshot.items.filter((item) => item.itemType === "RETRIEVED_CHUNK" && item.included).length} 个证据片段` : "尚无本轮检索记录"}</p>
                </fieldset>
              </details>
              <button className={styles.proposalListButton} onClick={() => setProposalListOpen((current) => !current)} type="button">
                操作提案列表 <span>{proposals?.proposals.length ?? 0}</span>
              </button>
            </div>
            {proposalListOpen ? (
              <section className={styles.proposalShelf} aria-label="操作提案列表">
                <header><strong>操作提案</strong><button aria-label="关闭操作提案列表" onClick={() => setProposalListOpen(false)} type="button">×</button></header>
                {proposals?.proposals.length ? [...proposals.proposals].reverse().map((proposal) => (
                  <article key={proposal.id}>
                    <button className={styles.proposalOpenButton} onClick={() => openProposal(proposal.id)} type="button">
                      <span>{proposal.status}</span><strong>{proposal.title}</strong><small>{new Date(proposal.updatedAt).toLocaleString("zh-CN")}</small>
                    </button>
                    {proposal.status !== "CONFIRMED" ? (
                      deleteProposalId === proposal.id ? (
                        <div className={styles.deleteProposalConfirm}><span>彻底删除？</span><button disabled={busy} onClick={() => deleteProposal(proposal.id)} type="button">删除</button><button onClick={() => setDeleteProposalId(null)} type="button">取消</button></div>
                      ) : <button className={styles.deleteProposalButton} onClick={() => setDeleteProposalId(proposal.id)} type="button">彻底删除</button>
                    ) : <small className={styles.auditKept}>已确认 · 保留审计记录</small>}
                  </article>
                )) : <p>还没有操作提案。</p>}
              </section>
            ) : null}
            {activeSkill ? (
              <div className={styles.activeSkillChip}>
                <span>Skill</span>
                <strong>{activeSkill.title}</strong>
                <button
                  aria-label={`移除 ${activeSkill.title} Skill`}
                  disabled={busy}
                  onClick={() => setActiveProductSkill(null)}
                  title="移除 Skill"
                  type="button"
                >×</button>
              </div>
            ) : null}
            <label className={styles.composer}>
              <span>告诉 AI 你想推进什么</span>
              <textarea name="ai-conversation-draft" maxLength={12_000} onChange={(event) => setDraft(event.target.value)} placeholder={activeSkill ? "可选：补充本次 Skill 的具体要求。留空也可以直接调用。" : "输入你的问题，或先从 Skill 任务选择一个专业功能。"} value={draft} />
            </label>
            <div className={styles.actions}>
              <button disabled={(!draft.trim() && !activeSkill) || !canCallModel || busy} onClick={sendMessage} type="button">{busy ? "处理中……" : activeSkill ? `调用 ${activeSkill.title}` : "发送"}</button>
              <button disabled={busy || !activeSkill} onClick={createProposal} type="button">整理为操作提案</button>
            </div>
            <p className={styles.statusLine} role="status">{notice}</p>
          </div>

        </div>
      )}

      {displayedProposal ? (
        <div className={styles.proposalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setProposalModalId(null); }}>
          <article aria-labelledby="proposal-dialog-title" aria-modal="true" className={styles.proposalModal} role="dialog">
            <header>
              <div><span>ACTION PROPOSAL</span><strong id="proposal-dialog-title">{displayedProposal.title}</strong></div>
              <button aria-label="关闭操作提案" onClick={() => setProposalModalId(null)} type="button">×</button>
            </header>
            <div className={styles.proposalBody}>
              <span>{displayedProposal.status}</span>
              <p>{displayedProposal.effect}</p>
              {displayedProposal.warnings.map((warning) => <small key={warning}>{warning}</small>)}
              {displayedProposal.status === "AWAITING_USER_CONFIRMATION" ? (
                <div className={styles.proposalActions}><button disabled={busy} onClick={() => decideProposal("CONFIRM")} type="button">确认提案</button><button disabled={busy} onClick={() => decideProposal("REJECT")} type="button">暂不执行</button></div>
              ) : null}
              {displayedProposal.status === "CONFIRMED" && displayedIntent?.productSkill === "general_revision" ? (
                <div className={styles.executionGate}>
                  <dl>
                    <div><dt>修改范围</dt><dd>{execution?.intent.sectionTitle ?? sectionTitle}</dd></div>
                    <div><dt>基础版本</dt><dd>{execution?.intent.baseVersionId ?? baseVersionId ?? "未绑定"}</dd></div>
                    <div><dt>材料范围</dt><dd>{turnAuthorizedMaterialIds.length ? `${turnAuthorizedMaterialIds.length} 份已授权材料` : "不发送材料"}</dd></div>
                    <div><dt>Provider / Model</dt><dd>{reviserModel ? `DeepSeek / ${reviserModel}` : "未配置"}</dd></div>
                    <div><dt>预计调用</dt><dd>1 次；无自动重试或 Fallback</dd></div>
                  </dl>
                  {!execution?.task ? <button disabled={busy || !reviserConfig || !reviserModel || !modelWorkspace?.platformCredentialConfigured || !baseVersionId} onClick={executeProposal} type="button">确认配置并执行 1 次</button> : null}
                </div>
              ) : null}
              {execution?.task ? (
                <section className={styles.executionResult}>
                  <span>任务 {execution.task.status} · 调用 {execution.task.callsUsed}/{execution.task.maxCalls}</span>
                  {execution.candidate ? (
                    <>
                      <section className={styles.completeCandidate} aria-label="完整可用章节候选"><span>COMPLETE CANDIDATE</span><strong>完整修订稿</strong><MarkdownMessage content={execution.candidate.content} /></section>
                      <section className={styles.candidateSummary}><strong>本次总结</strong><p>{summarizeDiff(execution.diff)}</p></section>
                      <div className={styles.diff} aria-label="原版本与候选版本差异">{execution.diff.map((item, index) => <div data-kind={item.kind} key={`${item.kind}-${index}`}><b>{item.kind}</b>{item.before !== null ? <del>{item.before}</del> : null}{item.after !== null ? <ins>{item.after}</ins> : null}</div>)}</div>
                      <div><button disabled={busy || execution.candidate.rejected || execution.candidate.adopted} onClick={() => decideCandidate("reject_candidate")} type="button">拒绝候选版本</button><button disabled={busy || execution.candidate.adopted} onClick={() => decideCandidate("adopt_candidate")} type="button">确认采用</button></div>
                    </>
                  ) : <p>尚未生成候选版本；失败不会修改基础版本。</p>}
                </section>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    const next = lines[index + 1]?.trim() ?? "";
    if (text.includes("|") && /^\|?\s*:?-{3,}/u.test(next)) {
      const rows = [text];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) { rows.push(lines[index].trim()); index += 1; }
      index -= 1;
      blocks.push(<div className={styles.markdownTableWrap} key={`table-${index}`}><table><thead><tr>{tableCells(rows[0]).map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{tableCells(row).map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (!text) blocks.push(<span className={styles.markdownSpace} key={index} />);
    else if (/^-{3,}$/u.test(text)) blocks.push(<hr key={index} />);
    else {
      const heading = text.match(/^(#{1,3})\s+(.+)$/u);
      const list = text.match(/^(?:(\d+)\.|[-*])\s+(.+)$/u);
      if (heading) blocks.push(<strong className={styles.markdownHeading} key={index}>{inlineMarkdown(heading[2])}</strong>);
      else if (list) blocks.push(<p className={styles.markdownList} key={index}><span>{list[1] ? `${list[1]}.` : "•"}</span><span>{inlineMarkdown(list[2])}</span></p>);
      else blocks.push(<p key={index}>{inlineMarkdown(text)}</p>);
    }
  }
  return <div className={styles.markdown}>{blocks}</div>;
}

function tableCells(row: string) { return row.replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim()); }
function isCompleteSkillArtifact(content: string): boolean {
  return /^##\s+(?:完整章节|完整修订稿)/mu.test(content);
}

function summarizeDiff(diff: M5ActionExecutionWorkspace["diff"]): string {
  const counts = diff.reduce<Record<string, number>>((current, item) => {
    current[item.kind] = (current[item.kind] ?? 0) + 1;
    return current;
  }, {});
  return `候选稿共保留 ${counts.UNCHANGED ?? 0} 段，修改 ${counts.MODIFIED ?? 0} 段，新增 ${counts.ADDED ?? 0} 段，删除 ${counts.REMOVED ?? 0} 段；采用前仍可逐段核对。`;
}

function inlineMarkdown(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/gu).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
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
