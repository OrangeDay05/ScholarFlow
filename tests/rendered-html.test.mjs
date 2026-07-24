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

test("server-renders the six M1 review routes", async () => {
  const routes = [
    ["/login", /进入你的论文工作区/],
    ["/projects", /当前最重要的下一步/],
    ["/projects/new", /先说，你手里有什么/],
    ["/projects/new/idea", /把一个念头，变成研究起点/],
    ["/projects/demo/diagnosis", /项目诊断卡/],
    ["/projects/demo/editor", /章节助手/],
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
  const [creationCss, editorSource] = await Promise.all([
    readFile(new URL("../app/projects/new/new.module.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/projects/[projectId]/editor/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(creationCss, /#fffbe2/i);
  assert.match(creationCss, /#185208/i);
  assert.match(editorSource, /导出 DOCX/);
  assert.doesNotMatch(editorSource, /导出 (?:PDF|Markdown)/i);
});
