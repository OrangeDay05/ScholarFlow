import type { DocumentBlock, DocumentContent, TextBlock } from "./types";

export function documentToPlainText(document: DocumentContent): string {
  return document.blocks.map(blockToPlainText).filter(Boolean).join("\n\n");
}

export function blockToPlainText(block: DocumentBlock): string {
  if (block.type === "image") return block.caption || block.altText || "[图片]";
  if (block.type === "table") {
    return block.rows.map((row) => row.cells.map((cell) => cell.blocks.map(textBlockToText).join(" ")).join("\t")).join("\n");
  }
  return textBlockToText(block);
}

export function textBlockToText(block: TextBlock): string {
  return block.runs.map((run) => run.text).join("");
}

export function legacyTextDocument(content: string): DocumentContent {
  return {
    version: 1,
    blocks: content.split(/\n{2,}/u).filter(Boolean).map((text, index) => ({
      id: `legacy-${index}`,
      type: "paragraph" as const,
      runs: [{ text }],
      sourceLocator: { part: "legacy-section-version", blockIndex: index },
    })),
  };
}

export function parseDocumentContent(value: string | null | undefined, fallback = ""): DocumentContent {
  if (value) {
    try {
      const parsed = JSON.parse(value) as DocumentContent;
      if (parsed?.version === 1 && Array.isArray(parsed.blocks)) return parsed;
    } catch { /* legacy fallback */ }
  }
  return legacyTextDocument(fallback);
}
