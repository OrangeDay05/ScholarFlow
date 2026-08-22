import assert from "node:assert/strict";
import test from "node:test";
import { assignManuscriptChunks } from "../app/lib/manuscript-import-mapping.ts";

test("manuscript mapping changes sections only at explicit numbered headings", () => {
  const sections = [
    { id: "s1", title: "引言" },
    { id: "s2", title: "研究问题与假设" },
    { id: "s3", title: "理论基础与分析框架" },
    { id: "s4", title: "材料与方法" },
    { id: "s5", title: "初步语料示例与观察" },
    { id: "s6", title: "预期分析思路" },
    { id: "s7", title: "后续研究计划与参考文献" },
  ];
  const texts = [
    "一、引言", "正文包含分析二字，但不是标题", "二、研究问题", "三、理论基础",
    "四、研究材料与方法", "4.1 语料来源与样本设计", "五、初步语料示例",
    "六、预期分析思路", "本研究预期按以下步骤推进分析：", "七、后续研究计划",
    "参考文献", "Lakoff, G. (1993). The contemporary theory of metaphor.", "AI使用声明",
  ];
  const mapping = assignManuscriptChunks(texts.map((text, ordinal) => ({ id: `c${ordinal}`, ordinal, text })), sections);
  assert.deepEqual(mapping.sections.map((bucket) => bucket.map((chunk) => chunk.text)), [
    [texts[1]], [], [], [texts[5]], [], [texts[8]], [],
  ]);
  assert.deepEqual(mapping.references.map((chunk) => chunk.text), [texts[11], texts[12]]);
});

test("manuscript mapping separates cover, abstract, keywords, and introduction", () => {
  const sections = [{ id: "s1", title: "引言" }];
  const texts = [
    "论文题目", "姓名：张三", "【摘要】摘要正文。", "【关键词】甲；乙", "引言开场正文。", "一、引言", "引言主体。",
  ];
  const mapping = assignManuscriptChunks(texts.map((text, ordinal) => ({ id: `f${ordinal}`, ordinal, text })), sections);
  assert.deepEqual(mapping.frontMatter.map((chunk) => chunk.text), texts.slice(0, 2));
  assert.deepEqual(mapping.abstract.map((chunk) => chunk.text), [texts[2]]);
  assert.deepEqual(mapping.keywords.map((chunk) => chunk.text), [texts[3]]);
  assert.deepEqual(mapping.sections[0].map((chunk) => chunk.text), [texts[4], texts[6]]);
});
