import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL(
  "../app/lib/progressive-diagnosis-mock.ts",
  import.meta.url,
);
const featureUrl = new URL(
  "../app/lib/progressive-diagnosis-features.ts",
  import.meta.url,
);
const pageUrl = new URL(
  "../app/projects/[projectId]/diagnosis/ProgressiveDiagnosisPage.tsx",
  import.meta.url,
);
const editorUrl = new URL(
  "../app/projects/[projectId]/editor/EditorClient.tsx",
  import.meta.url,
);
const creationUrl = new URL(
  "../app/projects/new/idea/page.tsx",
  import.meta.url,
);

test("freezes four diagnosis entries and the three-question creation minimum", async () => {
  const [contract, creation] = await Promise.all([
    readFile(contractUrl, "utf8"),
    readFile(creationUrl, "utf8"),
  ]);

  for (const entry of [
    "快速开始",
    "AI 引导梳理",
    "从材料自动提取",
    "完整专业填写",
  ]) {
    assert.match(contract, new RegExp(entry));
  }

  for (const question of [
    "你大概想研究、写作或完成什么",
    "你目前已经有哪些材料",
    "你希望 AI 首先帮助你完成什么",
  ]) {
    assert.match(creation, new RegExp(question));
  }

  assert.match(contract, /export const quickQuestions/);
  const quickBlock = contract
    .split("export const quickQuestions")[1]
    .split("export const guidedQuestions")[0];
  assert.equal((quickBlock.match(/\n    question_id:/g) ?? []).length, 3);
  assert.doesNotMatch(creation, /\brequired(?:=|\s)/);
});

test("records question tree, field state, source, confidence, and stop conditions", async () => {
  const contract = await readFile(contractUrl, "utf8");

  for (const property of [
    "question_id",
    "session_id",
    "topic",
    "field_key",
    "parent_question_id",
    "depends_on_answer",
    "why_this_matters",
    "decision_impact",
    "recommended_answer",
    "recommendation_reason",
    "allow_custom_answer",
    "allow_unknown",
    "allow_skip",
    "allow_ai_inference",
    "blocking_level",
    "source_material_ids",
    "source_locations",
    "answer_status",
    "answer_source_type",
    "confidence",
    "asked_at",
    "answered_at",
  ]) {
    assert.match(contract, new RegExp(`\\b${property}\\b`));
  }

  for (const status of [
    "USER_CONFIRMED",
    "AI_INFERRED",
    "PENDING_CONFIRMATION",
    "UNKNOWN",
    "SKIPPED",
    "MISSING_MATERIAL",
    "NOT_APPLICABLE",
  ]) {
    assert.match(contract, new RegExp(status));
  }

  for (const source of [
    "USER_INPUT",
    "MATERIAL_EXTRACTED",
    "AI_RECOMMENDED",
    "SYSTEM_DERIVED",
    "IMPORTED",
  ]) {
    assert.match(contract, new RegExp(source));
  }

  assert.match(contract, /用户连续两次选择不知道/);
  assert.match(contract, /达到当前模式的问题上限/);
  assert.match(contract, /继续追问只能得到低可信度推测/);
});

test("keeps guidance single-question, non-coercive, and inference-explicit", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /const currentQuestion/);
  assert.match(page, /currentQuestion\.question/);
  assert.match(page, /为什么要问/);
  assert.match(page, /会影响什么/);
  assert.match(page, /AI 推荐 · 待用户确认/);
  assert.match(page, /我不知道/);
  assert.match(page, /暂时跳过/);
  assert.match(page, /不适用/);
  assert.match(page, /稍后再决定/);
  assert.match(page, /先保留为 AI 推测/);
  assert.match(page, /nextUnknownCount >= 2/);
  assert.match(page, /先开始，稍后补充/);
});

test("uses task-level readiness instead of globally locking the project", async () => {
  const [contract, editor] = await Promise.all([
    readFile(contractUrl, "utf8"),
    readFile(editorUrl, "utf8"),
  ]);

  for (const status of [
    "READY",
    "READY_WITH_WARNINGS",
    "NEEDS_CONFIRMATION",
    "NEEDS_MATERIAL",
    "BLOCKED",
  ]) {
    assert.match(contract, new RegExp(status));
  }

  assert.match(contract, /文献探索/);
  assert.match(contract, /结果章节写作/);
  assert.match(editor, /PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED/);
  assert.match(editor, /READY_WITH_WARNINGS/);
  assert.match(editor, /结果章节需要真实数据/);
  assert.match(editor, /方法章节需要确认研究对象/);
});

test("keeps versions append-only and the capability front-only", async () => {
  const [contract, page, feature] = await Promise.all([
    readFile(contractUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(featureUrl, "utf8"),
  ]);

  for (const status of [
    "DRAFT",
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "SUPERSEDED",
    "ARCHIVED",
  ]) {
    assert.match(contract, new RegExp(status));
  }

  assert.match(page, /diagnosis-v3/);
  assert.match(page, /D1、D2/);
  assert.match(page, /AI 推测不能直接改变已确认版本/);
  assert.match(feature, /NEXT_PUBLIC_PROGRESSIVE_DIAGNOSIS_MOCK/);
  assert.doesNotMatch(
    `${contract}\n${page}\n${feature}`,
    /drizzle|db\/schema|saveM3Diagnosis|app\/api|grill-me/i,
  );
});
