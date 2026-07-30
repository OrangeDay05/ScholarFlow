import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { unzipSync } from "fflate";
import { HttpM9PptxRunnerAdapter } from "../app/lib/m9-pptx-runner.ts";

const port = 4321; const endpoint = `http://127.0.0.1:${port}`; const artifactEntry = process.env.ARTIFACT_TOOL_ENTRY;
if (!artifactEntry) throw new Error("ARTIFACT_TOOL_ENTRY is required for M9 real PPTX test.");
let runner;
before(async () => { runner = spawn(process.execPath, [resolve("scripts/m9-pptx-runner.mjs"), String(port)], { cwd: resolve("."), env: { ...process.env, ARTIFACT_TOOL_ENTRY: artifactEntry }, stdio: "ignore", windowsHide: true }); const deadline = Date.now() + 60_000; while (Date.now() < deadline) { try { if ((await fetch(`${endpoint}/health`)).ok) return; } catch {} await new Promise((resolveWait) => setTimeout(resolveWait, 250)); } throw new Error("M9 runner did not become healthy within 60 seconds."); });
after(() => runner?.kill());

const slides = [
  { title: "数字平台中的知识协作", body: ["课程论文汇报", "来源绑定到当前项目版本"], speakerNotes: "介绍研究范围。\n\n[Sources]\n- 项目诊断卡", sourceBindings: ["diagnosis-v1"] },
  { title: "研究问题决定汇报主线", body: ["平台规则如何影响协作行为", "协作行为如何形成知识结果"], takeaway: "先明确关系，再解释机制。", speakerNotes: "解释问题之间的层级。\n\n[Sources]\n- section-introduction-v3", sourceBindings: ["section-introduction-v3"] },
  { title: "证据强度决定表达边界", body: ["可核验材料支持直接判断", "缺失信息保留为待确认"], takeaway: "不把多数意见当作事实。", speakerNotes: "说明证据等级。\n\n[Sources]\n- material-1", sourceBindings: ["material-1"] },
  { title: "没有真实结果时只展示分析计划", body: ["样本与方法仍需确认", "预期结果必须明确标注"], takeaway: "不生成虚构数据。", speakerNotes: "提醒当前限制。\n\n[Sources]\n- project-readiness", sourceBindings: ["project-readiness"] },
  { title: "下一步是补齐材料并验证关键关系", body: ["确认数据来源", "运行分析", "回填证据绑定"], takeaway: "让下一步可执行。", speakerNotes: "收束并进入问答。\n\n[Sources]\n- project-plan", sourceBindings: ["project-plan"] },
];
const deck = { title: slides[0].title, subtitle: "课程研究汇报", scene: "COURSE_PRESENTATION", audience: "课程教师与同学", durationMinutes: 15, language: "zh-CN", visualStyle: "scholar_green", slides, qaPreparation: [{ question: "目前是否已有真实结果？", answer: "尚无，本版仅展示分析计划。" }] };

test("M9 artifact-tool runner creates an importable PPTX with notes", async () => {
  const adapter = new HttpM9PptxRunnerAdapter(endpoint); const result = await adapter.render({ runId: crypto.randomUUID(), deck, timeoutSeconds: 90 });
  assert.equal(result.status, "succeeded", JSON.stringify(result)); assert.equal(result.slideCount, 5); assert.ok(result.pptxBase64);
  const bytes = Buffer.from(result.pptxBase64, "base64"); const files = unzipSync(bytes); assert.ok(files["ppt/presentation.xml"]); assert.equal(Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length, 5); assert.ok(Object.keys(files).some((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name)));
  const output = resolve("docs/reviews/M9/artifacts/m9-sample.pptx"); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
  const { FileBlob, PresentationFile } = await import(pathToFileURL(artifactEntry).href); const imported = await PresentationFile.importPptx(await FileBlob.load(output));
  assert.equal(imported.slides.items.length, 5); const inspection = await imported.inspect({ kind: "slide,textbox,notes", maxChars: 12_000 }); assert.match(inspection.ndjson, /研究问题决定汇报主线/u); assert.match(inspection.ndjson, /\[Sources\]/u);
  const renderDirectory = resolve("docs/reviews/M9/artifacts/m9-sample"); await mkdir(renderDirectory, { recursive: true });
  for (const [index, slide] of imported.slides.items.entries()) { const png = await imported.export({ slide, format: "png", scale: 1 }); await writeFile(resolve(renderDirectory, `slide-${index + 1}.png`), new Uint8Array(await png.arrayBuffer())); const layout = JSON.parse(await (await slide.export({ format: "layout" })).text()); assert.ok(layout); }
  assert.ok((await readFile(output)).length > 10_000);
});
