import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createActionProposal,
  createToolIntent,
  decideActionProposal,
  M5_CONVERSATION_SKILL_PROMPTS,
  summarizeConversation,
} from "../app/lib/m5-conversation-agent.ts";

const editor = await readFile(
  new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
  "utf8",
);
const workspaceContext = await readFile(
  new URL("../app/lib/MockWorkspaceContext.tsx", import.meta.url),
  "utf8",
);

test("provides one default prompt for each of the six product skills", () => {
  assert.equal(M5_CONVERSATION_SKILL_PROMPTS.length, 6);
  assert.equal(
    new Set(M5_CONVERSATION_SKILL_PROMPTS.map((prompt) => prompt.productSkill)).size,
    6,
  );
  assert.ok(M5_CONVERSATION_SKILL_PROMPTS.every((prompt) => prompt.prompt.length > 12));
});

test("creates a bounded ToolIntent and requires an explicit user confirmation", () => {
  const intent = createToolIntent({
    conversationId: "conversation-1",
    productSkill: "chapter_writing",
    operation: "准备引言写作方案",
    rationale: "用户明确要求推进引言",
    authorizedMaterialIds: ["material-1", "material-1"],
    now: "2026-07-28T00:00:00.000Z",
  });
  assert.deepEqual(intent.authorizedMaterialIds, ["material-1"]);
  assert.equal(intent.state, "PROPOSED");

  const proposal = createActionProposal(intent, "准备章节写作任务");
  assert.equal(proposal.status, "AWAITING_USER_CONFIRMATION");
  assert.equal(proposal.decidedAt, null);

  const confirmed = decideActionProposal(
    proposal,
    "CONFIRM",
    "2026-07-28T00:01:00.000Z",
  );
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.decidedAt, "2026-07-28T00:01:00.000Z");
  assert.deepEqual(
    decideActionProposal(confirmed, "REJECT", "2026-07-28T00:02:00.000Z"),
    confirmed,
  );
});

test("summaries retain bounded source references and are not user-confirmed facts", () => {
  const messages = Array.from({ length: 9 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? "AGENT" : "USER",
    content: `第 ${index} 条会话内容`,
    createdAt: "2026-07-28T00:00:00.000Z",
  }));
  const summary = summarizeConversation(
    messages,
    "2026-07-28T00:03:00.000Z",
  );
  assert.deepEqual(summary.sourceMessageIds, [
    "message-3",
    "message-4",
    "message-5",
    "message-6",
    "message-7",
    "message-8",
  ]);
  assert.equal(summary.status, "DERIVED_NOT_USER_CONFIRMED");
  assert.ok(summary.text.length <= 240);
});

test("editor exposes dual workspace tabs without replacing existing skill task tabs", () => {
  assert.match(editor, /对话 Agent/);
  assert.match(editor, /Skill 任务/);
  assert.match(editor, /本次材料授权/);
  assert.match(editor, /引用证据/);
  assert.match(editor, /任务记录/);
  assert.match(editor, /尚未执行真实任务/);
  assert.doesNotMatch(editor, /execute\(.*actionProposal/s);
});

test("skill selection opens the conversation with its prompt instead of duplicating a prompt picker", () => {
  assert.match(editor, /function openSkillInConversation/);
  assert.match(editor, /setConversationDraft\(prompt\.prompt\)/);
  assert.match(editor, /setWorkspaceMode\("conversation"\)/);
  assert.match(editor, /openSkillInConversation\(skill\.id\)/);
  assert.doesNotMatch(editor, /六个 Skill 默认 Prompt/);
});

test("the demo editor keeps its main content when persisted outline data is empty", () => {
  assert.match(workspaceContext, /snapshot\.outline\?\.sections\.length/);
  assert.match(workspaceContext, /requestedProjectId === "demo"/);
  assert.match(workspaceContext, /setOutline\(initialOutline\)/);
});
