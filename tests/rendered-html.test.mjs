import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let worker;

async function render(pathname) {
  if (!worker) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    ({ default: worker } = await import(workerUrl.href));
  }

  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  return { response, html: await response.text() };
}

test("server-renders the M2 clickable-loop and admin routes", async () => {
  const routes = [
    ["/login", /进入你的论文工作区/],
    ["/projects", /当前最重要的下一步/],
    ["/projects/new", /先说，你手里有什么/],
    ["/projects/new/idea", /把一个念头，变成研究起点/],
    ["/projects/demo/diagnosis", /项目诊断卡/],
    ["/projects/demo/outline", /确认论文目录/],
    ["/projects/demo/editor", /AI 工作台/],
    ["/projects/demo/export", /Word 导出检查/],
    ["/admin/users", /用户管理/],
    ["/admin/projects-files", /项目与文件/],
    ["/admin/tasks", /AI 任务/],
    ["/admin/models-skills", /模型与 Skill/],
  ];

  for (const [pathname, expectation] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(html, expectation, `${pathname} should contain its page landmark`);
    assert.match(html, /Mock|MOCK|演示/, `${pathname} should identify non-real data`);
  }
});

test("freezes five creation paths and six product-level skills", async () => {
  const mockSource = await readFile(new URL("../app/lib/m1-mock.ts", import.meta.url), "utf8");

  for (const title of [
    "从一个 Idea 开始",
    "导入已有初稿",
    "上传论文要求",
    "导入文献与范文",
    "上传数据与研究材料",
  ]) {
    assert.match(mockSource, new RegExp(title));
  }

  for (const title of [
    "项目诊断与提纲",
    "文献总结与文献矩阵",
    "通用章节写作",
    "通用修改",
    "一致性检查",
    "引用与证据检查",
  ]) {
    assert.match(mockSource, new RegExp(title));
  }

  const creationBlock = mockSource.split("export const productSkills")[0];
  assert.equal((creationBlock.match(/href: "\/projects\/new\//g) ?? []).length, 5);
  assert.equal((mockSource.match(/\bindex: "0[1-6]"/g) ?? []).length >= 6, true);
});

test("keeps approved creation-card colors and DOCX-only export", async () => {
  const [creationCss, editorSource, exportSource] = await Promise.all([
    readFile(new URL("../app/projects/new/new.module.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/projects/[projectId]/export/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(creationCss, /#fffbe2/i);
  assert.match(creationCss, /#185208/i);
  assert.match(editorSource, /DOCX 检查/);
  assert.match(exportSource, /只提供 DOCX/);
  assert.doesNotMatch(`${editorSource}\n${exportSource}`, /导出 (?:PDF|Markdown)/i);
});

test("freezes M2 workflow states, evidence boundaries, and backup-model choice", async () => {
  const [workspaceSource, editorSource, diagnosisSource, outlineSource] = await Promise.all([
    readFile(new URL("../app/lib/MockWorkspaceContext.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/projects/[projectId]/diagnosis/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/projects/[projectId]/outline/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const status of ["queued", "parsing", "success", "failed", "cancelled"]) {
    assert.match(workspaceSource, new RegExp(`"${status}"`));
  }

  assert.match(workspaceSource, /confirmedDiagnosis/);
  assert.match(diagnosisSource, /待重新确认/);
  assert.match(outlineSource, /确认目录并进入编辑器/);
  assert.match(editorSource, /DeepSeek 备用模型/);
  assert.match(editorSource, /恢复为新版本/);
  assert.match(editorSource, /无法确认/);
  assert.match(editorSource, /页码/);
  assert.match(editorSource, /段落/);
  assert.match(editorSource, /项目规划/);
  assert.match(editorSource, /写作与资料/);
  assert.match(editorSource, /检查与验证/);
  assert.match(editorSource, /任务准备状态/);
  assert.match(editorSource, /disabled=\{!availability\.enabled\}/);
});

test("freezes the independent editor workspace and evidence linkage", async () => {
  const [editorSource, editorCss] = await Promise.all([
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/projects/[projectId]/editor/Editor.module.css", import.meta.url),
      "utf8",
    ),
  ]);

  for (const landmark of [
    "data-editor-workspace",
    "data-document-scroll",
    "data-assistant-scroll",
    "IntersectionObserver",
    "paperStack",
    "focusEvidence",
    "focusClaim",
    "workspaceWithoutLeft",
    "workspaceWithoutRight",
    "本次材料授权",
    "引用证据",
    "任务记录",
  ]) {
    assert.match(editorSource, new RegExp(landmark));
  }

  assert.match(editorCss, /height:\s*100dvh/);
  assert.match(editorCss, /\.documentArea[\s\S]*?overflow-y:\s*auto/);
  assert.match(editorCss, /\.assistantScroll[\s\S]*?overflow-y:\s*auto/);
  assert.match(editorCss, /\.taskDock/);
  assert.match(editorCss, /@media \(max-width:\s*820px\)/);
});
