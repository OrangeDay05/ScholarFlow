import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the create-project card is one accessible link", async () => {
  const page = await source("../app/projects/page.tsx");
  const styles = await source("../app/projects/Projects.module.css");
  const start = page.indexOf("<Link\n          className={styles.emptyHint}");
  const end = page.indexOf("</Link>", start);
  const card = page.slice(start, end + "</Link>".length);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(card.match(/<Link\b/g)?.length, 1);
  assert.match(card, /href="\/projects\/new"/);
  assert.match(card, /创建新项目/);
  assert.match(card, /可从 Idea、初稿、论文要求、文献范文或研究数据开始/);
  assert.match(card, /选择创建方式/);
  assert.match(styles, /\.emptyHint:focus-visible/);
  assert.match(styles, /\.emptyHint:hover/);
});

test("the material picker exposes one custom control and truthful file states", async () => {
  const form = await source("../app/projects/new/_components/UploadProjectForm.tsx");
  const styles = await source("../app/projects/new/_components/forms.module.css");

  assert.match(form, /className=\{formStyles\.visuallyHidden\}/);
  assert.match(form, /multiple\s+tabIndex=\{-1\}\s+aria-hidden="true"\s+type="file"/);
  assert.match(form, /aria-label="选择或拖放本机材料"/);
  assert.match(form, /onDragOver=/);
  assert.match(form, /onDrop=/);
  assert.match(form, /已选择 \{selectedFiles\.length\} 个文件/);
  assert.match(form, /aria-label=\{`移除 \$\{file\.name\}`\}/);
  assert.match(form, /"已选择"/);
  assert.match(form, /"等待上传"/);
  assert.match(form, /"stored"/);
  assert.match(form, /"确认开始读取"/);
  assert.match(form, /"查看处理列表"/);
  assert.match(form, /"下一步"/);
  assert.match(form, /creation-assist/);
  assert.match(form, /AI 根据材料填入创建信息/);
  assert.match(form, /"原始文件已存储，等待开始解析"/);
  assert.match(form, /"解析成功"/);
  assert.match(form, /\/materials\/\$\{material\.materialId\}\/parse/);
  assert.match(form, /diagnosis\/candidate/);
  assert.doesNotMatch(form, /已进入知识库|证据提取完成/);
  assert.match(styles, /\.visuallyHidden/);
  assert.match(styles, /\.uploadBox:focus-visible/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.doesNotMatch(styles, /file-selector-button/);
});

test("all five creation entries share file intake and AI candidate fields", async () => {
  const form = await source("../app/projects/new/_components/UploadProjectForm.tsx");
  const idea = await source("../app/projects/new/idea/page.tsx");
  const scaffold = await source("../app/projects/new/_components/FormScaffold.tsx");

  assert.match(form, /type UploadKind = "idea" \| "draft" \| "requirements" \| "literature" \| "data"/);
  assert.match(idea, /<UploadProjectForm kind="idea"/);
  assert.match(scaffold, /AI 可根据材料填入/);
  assert.match(scaffold, /AI 已填入候选/);
  assert.match(scaffold, /processLabel/);
});

test("project actions keep diagnosis and deletion reachable", async () => {
  const projects = await source("../app/projects/page.tsx");
  const deletion = await source("../app/projects/ProjectDeleteButton.tsx");
  const editor = await source("../app/projects/[projectId]/editor/EditorClient.tsx");

  assert.match(projects, /ProjectDeleteButton/);
  assert.match(deletion, /role="dialog"/);
  assert.match(deletion, /method: "DELETE"/);
  assert.match(deletion, /确认删除/);
  assert.match(editor, /href=\{`\/projects\/\$\{projectId\}\/diagnosis`\}/);
  assert.match(editor, /项目诊断卡/);
});
