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

test("server-renders public authentication and admin routes", async () => {
  const routes = [
    ["/login", /进入你的论文工作区/],
    ["/register", /开始独立研究工作区/],
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
  }
});

test("anonymous project pages redirect to login", async () => {
  for (const pathname of [
    "/projects",
    "/projects/new",
    "/projects/new/idea",
    "/projects/demo/diagnosis",
    "/projects/demo/outline",
    "/projects/demo/editor",
    "/projects/demo/export",
  ]) {
    const { response } = await render(pathname);
    assert.ok([302, 307, 308].includes(response.status), `${pathname} should redirect`);
    assert.match(response.headers.get("location") ?? "", /\/login\?return_to=/);
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
  const [workspaceSource, editorSource, diagnosisSource, legacyDiagnosisSource, outlineSource] = await Promise.all([
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
      new URL("../app/projects/[projectId]/diagnosis/LegacyDiagnosisPage.tsx", import.meta.url),
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
  assert.match(`${diagnosisSource}\n${legacyDiagnosisSource}`, /待重新确认/);
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
  assert.equal(
    (editorSource.match(/className=\{styles\.desktopSidebarAction\}/g) ?? []).length,
    2,
  );
  assert.match(editorSource, /compactOpenLabel/);
  assert.match(editorSource, /outlineDrawerRef\.current\.open = false/);
  assert.match(editorSource, /assistantDrawerRef\.current\.open = false/);
  assert.match(
    editorCss,
    /@media \(max-width:\s*820px\)[\s\S]*?\.desktopSidebarAction\s*\{\s*display:\s*none/,
  );
});

test("renders the gated V0.4.2 incremental mock pages without replacing M2", async () => {
  const routes = [
    ["/extensions", /研究扩展工作区/],
    ["/extensions/idea-exploration", /Idea 探索/],
    ["/extensions/external-literature", /外部文献/],
    ["/extensions/advanced-review", /高级审稿/],
    ["/extensions/submission-revision", /投稿返修/],
    ["/extensions/research-figures", /科研图件/],
    ["/extensions/presentations", />PPT</],
  ];

  for (const [pathname, expectation] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
    assert.match(html, expectation);
    assert.match(html, /Mock|MOCK|演示/);
    assert.match(html, /不改写 M2|M2 核心工作台保持不变/);
  }

  const [flagSource, shellSource, editorSource] = await Promise.all([
    readFile(new URL("../app/lib/v042-features.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(flagSource, /NEXT_PUBLIC_V042_INCREMENTAL_MOCK/);
  assert.match(shellSource, /V042_INCREMENTAL_MOCK_ENABLED/);
  assert.match(editorSource, /V042_INCREMENTAL_MOCK_ENABLED/);
  assert.match(editorSource, /研究扩展/);
});

test("renders the gated dual-model review mock inside the M2 editor", async () => {
  const [flagSource, contractSource, editorSource] = await Promise.all([
    readFile(new URL("../app/lib/dual-model-review-features.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/dual-model-review-mock.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const landmark of ["AI 复核", "严格复核", "审阅只创建报告"]) {
    assert.match(editorSource, new RegExp(landmark));
  }
  assert.match(contractSource, /DeepSeek V4 Pro/);

  assert.match(flagSource, /NEXT_PUBLIC_DUAL_MODEL_REVIEW_MOCK/);
  assert.match(contractSource, /REVIEW_FAILED/);
  assert.match(contractSource, /PASSED_WITH_WARNINGS/);
  assert.match(editorSource, /appendMockVersion/);
  assert.doesNotMatch(`${flagSource}\n${contractSource}`, /drizzle|schema\.ts|app\/api\//);
});

test("renders the progressive diagnosis entry without adding a seventh skill", async () => {
  const [flagSource, pageSource, mockSource] = await Promise.all([
    readFile(new URL("../app/lib/progressive-diagnosis-features.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/projects/[projectId]/diagnosis/ProgressiveDiagnosisPage.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/lib/m1-mock.ts", import.meta.url), "utf8"),
  ]);

  for (const landmark of [
    "AI 引导梳理",
    "快速开始",
    "从材料自动提取",
    "完整专业填写",
    "创建项目只需要 3 个答案",
  ]) {
    assert.match(pageSource, new RegExp(landmark));
  }

  assert.match(flagSource, /NEXT_PUBLIC_PROGRESSIVE_DIAGNOSIS_MOCK/);
  assert.match(pageSource, /不调用真实动态模型/);
  assert.match(pageSource, /前端仍只展示六个产品级 Skill/);
  assert.equal((mockSource.match(/\bindex: "0[1-6]"/g) ?? []).length >= 6, true);
});

test("renders bounded model orchestration and user credential mock", async () => {
  const { response, html } = await render("/settings/models");
  assert.equal(response.status, 200);

  for (const landmark of [
    "模型与 API",
    "平台提供模型",
    "使用自己的 API Key",
    "标准模式",
    "严格模式",
    "自定义模式",
    "不要粘贴真实 Key",
  ]) {
    assert.match(html, new RegExp(landmark));
  }

  const [flagSource, shellSource, editorSource] = await Promise.all([
    readFile(new URL("../app/lib/model-orchestration-features.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/EditorClient.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(flagSource, /NEXT_PUBLIC_MODEL_ORCHESTRATION_MOCK/);
  assert.match(shellSource, /模型与 API/);
  assert.match(editorSource, /配置模型与 API/);
  assert.match(editorSource, /验证模型/);
});
