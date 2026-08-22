"use client";

import type { CSSProperties, ReactNode } from "react";
import type { DocumentBlock, DocumentContent, TextBlock, TextRun } from "@/app/lib/document-model/types";
import { documentToPlainText } from "@/app/lib/document-model/projection";

export function StructuredDocument({ document, projectId }: { document: DocumentContent; projectId: string }) {
  return <>{document.blocks.map((block) => renderBlock(block, projectId))}</>;
}

function renderBlock(block: DocumentBlock, projectId: string): ReactNode {
  if (block.type === "image") return <figure contentEditable={false} data-asset-id={block.assetId} data-block-id={block.id} data-block-type="image" key={block.id}><img alt={block.altText ?? "初稿图片"} height={block.height} src={`/api/m5/projects/${projectId}/parsed-assets/${block.assetId}`} width={block.width} />{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>;
  if (block.type === "table") return <table data-block-id={block.id} data-block-type="table" key={block.id}><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.cells.map((cell, cellIndex) => <td colSpan={cell.colSpan} key={cellIndex} rowSpan={cell.rowSpan}>{cell.blocks.map((item) => renderTextBlock(item))}</td>)}</tr>)}</tbody></table>;
  return renderTextBlock(block);
}

function renderTextBlock(block: TextBlock) {
  const props = { "data-block-id": block.id, "data-block-type": block.type, "data-level": block.level, style: { textAlign: block.alignment } as CSSProperties, key: block.id };
  const children = block.runs.map((run, index) => <span data-run="true" key={index} style={runStyle(run)}>{run.text}</span>);
  if (block.type === "heading") { const Tag = `h${Math.min(6, Math.max(1, block.level ?? 1))}` as "h1"; return <Tag {...props}>{children}</Tag>; }
  if (block.type === "list_item") return <div {...props} data-numbering-id={block.numberingId} data-ordered={String(block.ordered)}>{children}</div>;
  return <p {...props}>{children}</p>;
}

function runStyle(run: TextRun): CSSProperties {
  return { fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? "italic" : undefined, textDecoration: run.underline ? "underline" : undefined, fontFamily: run.fontFamily, fontSize: run.fontSizePt ? `${run.fontSizePt}pt` : undefined, color: run.color ? `#${run.color}` : undefined, verticalAlign: run.superscript ? "super" : run.subscript ? "sub" : undefined };
}

export function serializeStructuredEditor(root: HTMLElement, fallback: DocumentContent): { document: DocumentContent; plainText: string } {
  const fallbackById = new Map(fallback.blocks.map((block) => [block.id, block]));
  const blocks: DocumentBlock[] = [];
  for (const element of Array.from(root.children) as HTMLElement[]) {
    const id = element.dataset.blockId;
    const type = element.dataset.blockType as DocumentBlock["type"] | undefined;
    if (!id || !type) continue;
    const original = fallbackById.get(id);
    if (type === "image" && original?.type === "image") { blocks.push(original); continue; }
    if (type === "table" && original?.type === "table") {
      const rows = Array.from(element.querySelectorAll(":scope > tbody > tr")).map((row, rowIndex) => ({ cells: Array.from(row.children).map((cell, cellIndex) => ({ blocks: [{ id: `${id}-r${rowIndex}-c${cellIndex}`, type: "paragraph" as const, runs: [{ text: cell.textContent ?? "" }], sourceLocator: original.sourceLocator }], colSpan: (cell as HTMLTableCellElement).colSpan || undefined, rowSpan: (cell as HTMLTableCellElement).rowSpan || undefined })) }));
      blocks.push({ ...original, rows }); continue;
    }
    const originalText = original && original.type !== "image" && original.type !== "table" ? original : null;
    const runs = Array.from(element.querySelectorAll(":scope > [data-run='true']")).map((span) => ({ text: span.textContent ?? "", bold: (span as HTMLElement).style.fontWeight === "700", italic: (span as HTMLElement).style.fontStyle === "italic", underline: (span as HTMLElement).style.textDecoration.includes("underline"), fontFamily: (span as HTMLElement).style.fontFamily || undefined, fontSizePt: parseFloat((span as HTMLElement).style.fontSize) || undefined, color: rgbToHex((span as HTMLElement).style.color) }));
    blocks.push({ ...(originalText ?? { id, sourceLocator: { part: "editor", blockIndex: blocks.length } }), type: type as TextBlock["type"], runs: runs.length ? runs : [{ text: element.textContent ?? "" }] } as TextBlock);
  }
  const document = { version: 1 as const, blocks };
  return { document, plainText: documentToPlainText(document) };
}

function rgbToHex(value: string): string | undefined {
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(value);
  return match ? match.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase() : value.replace(/^#/u, "") || undefined;
}
