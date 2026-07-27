import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("freezes the three dual-model review modes and five conclusions", async () => {
  const mock = await source("../app/lib/dual-model-review-mock.ts");

  for (const label of [
    "不复核",
    "标准复核",
    "严格复核",
    "快速模式",
    "标准模式",
    "严格模式",
  ]) {
    assert.match(mock, new RegExp(label));
  }

  for (const conclusion of [
    "PASSED",
    "PASSED_WITH_WARNINGS",
    "REVISION_REQUIRED",
    "BLOCKED",
    "REVIEW_FAILED",
  ]) {
    assert.match(mock, new RegExp(`"${conclusion}"`));
  }

  assert.match(mock, /OpenAI/);
  assert.match(mock, /DeepSeek/);
  assert.match(mock, /provider/);
  assert.match(mock, /skillVersion/);
});

test("keeps review evidence-bound, user-controlled, and append-only", async () => {
  const [editor, context] = await Promise.all([
    source("../app/projects/[projectId]/editor/EditorClient.tsx"),
    source("../app/lib/MockWorkspaceContext.tsx"),
  ]);

  for (const text of [
    "用户原始要求",
    "已确认诊断卡",
    "本次授权材料",
    "生成版本",
    "已建立证据绑定",
    "审阅只创建报告，不直接修改正文",
    "接受原版本",
    "忽略问题并记录理由",
    "更换后重新审阅",
    "最多执行一次，不进入自动循环",
  ]) {
    assert.match(editor, new RegExp(text));
  }

  assert.match(editor, /appendMockVersion/);
  assert.match(context, /appendMockVersion/);
  assert.match(editor, /source: `按审阅意见修订/);
  assert.match(editor, /REVIEW_FAILED/);
});

test("keeps the capability behind one front-end mock switch", async () => {
  const [feature, mock, editor] = await Promise.all([
    source("../app/lib/dual-model-review-features.ts"),
    source("../app/lib/dual-model-review-mock.ts"),
    source("../app/projects/[projectId]/editor/EditorClient.tsx"),
  ]);

  assert.match(feature, /NEXT_PUBLIC_DUAL_MODEL_REVIEW_MOCK/);
  assert.match(feature, /!== "false"/);
  assert.match(editor, /DUAL_MODEL_REVIEW_MOCK_ENABLED/);
  assert.doesNotMatch(`${feature}\n${mock}`, /db\/|drizzle|cloudflare:workers|\/api\//);
});
