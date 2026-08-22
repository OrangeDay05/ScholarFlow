export type ManuscriptMappingChunk = { id: string; ordinal: number; text: string };
export type ManuscriptMappingSection = { id: string; title: string };

export type ManuscriptMappingResult = {
  frontMatter: ManuscriptMappingChunk[];
  abstract: ManuscriptMappingChunk[];
  keywords: ManuscriptMappingChunk[];
  sections: ManuscriptMappingChunk[][];
  references: ManuscriptMappingChunk[];
};

export function assignManuscriptChunks(
  chunks: ManuscriptMappingChunk[],
  sections: ManuscriptMappingSection[],
): ManuscriptMappingResult {
  const buckets = sections.map(() => [] as ManuscriptMappingChunk[]);
  const frontMatter: ManuscriptMappingChunk[] = [];
  const abstract: ManuscriptMappingChunk[] = [];
  const keywords: ManuscriptMappingChunk[] = [];
  const references: ManuscriptMappingChunk[] = [];
  let currentIndex = 0;
  let inReferences = false;
  let frontMode: "cover" | "abstract" | "keywords" | "body" = "cover";

  for (const chunk of chunks) {
    const firstLine = chunk.text.trim().split(/\r?\n/u)[0]?.trim() ?? "";
    if (/^[【[]摘要[】\]]/u.test(firstLine)) {
      frontMode = "abstract";
      abstract.push(chunk);
      continue;
    }
    if (/^[【[]关键词[】\]]/u.test(firstLine)) {
      frontMode = "keywords";
      keywords.push(chunk);
      continue;
    }
    if (firstLine === "参考文献") {
      inReferences = true;
      continue;
    }
    if (firstLine === "AI使用声明") {
      references.push(chunk);
      continue;
    }
    const headingIndex = detectNumberedHeading(firstLine, sections);
    if (headingIndex >= 0) {
      currentIndex = headingIndex;
      inReferences = false;
      frontMode = "body";
      continue;
    }
    if (inReferences) references.push(chunk);
    else if (frontMode === "cover") frontMatter.push(chunk);
    else if (frontMode === "abstract") abstract.push(chunk);
    else if (frontMode === "keywords") {
      frontMode = "body";
      buckets[0]?.push(chunk);
    } else buckets[currentIndex]?.push(chunk);
  }
  return { frontMatter, abstract, keywords, sections: buckets, references };
}

function detectNumberedHeading(firstLine: string, sections: ManuscriptMappingSection[]): number {
  if (!/^(?:[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十]+[章节部分]|\d+(?:\.\d+)*[、.．\s])/u.test(firstLine)) return -1;
  const heading = normalizeHeading(firstLine);
  let bestIndex = -1;
  let bestScore = 0;
  sections.forEach((section, index) => {
    const terms = normalizeHeading(section.title).split(/[与和、：:（）()]/u).filter((term) => term.length >= 2);
    const score = terms.reduce((total, term) => total + (heading.includes(term) ? term.length : 0), 0);
    if (score > bestScore) { bestIndex = index; bestScore = score; }
  });
  return bestScore >= 2 ? bestIndex : -1;
}

function normalizeHeading(value: string): string {
  return value
    .replace(/^(?:[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十]+[章节部分]|\d+(?:\.\d+)*[、.．\s]*)/u, "")
    .replace(/\s+/gu, "");
}
