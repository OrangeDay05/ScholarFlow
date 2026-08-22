import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import type { MaterialChunkDraft } from "./text-reference-parsers";
import type { DocumentBlock, DocumentContent, ParsedDocumentAsset, TextBlock, TextRun } from "../document-model/types";
import { blockToPlainText } from "../document-model/projection";

const MAX_DOCUMENT_PARSE_BYTES = 15 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_PDF_PAGES = 300;
const PDF_TIMEOUT_MS = 30_000;

export class DocumentParseError extends Error {
  readonly code:
    | "DOCUMENT_TOO_LARGE"
    | "INVALID_DOCX"
    | "ZIP_EXPANSION_LIMIT"
    | "PDF_PAGE_LIMIT"
    | "PDF_TIMEOUT"
    | "SCANNED_PDF_OCR_REQUIRED"
    | "PDF_PARSE_FAILED";

  constructor(code: DocumentParseError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type DocumentParseResult = {
  parserKey: string;
  parserVersion: "1.0.0";
  recordCount: number;
  chunks: MaterialChunkDraft[];
  structuredDocument?: DocumentContent;
  assets?: ParsedDocumentAsset[];
  warnings?: string[];
};

export function parseDocx(bytes: ArrayBuffer | Uint8Array): DocumentParseResult {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  assertDocumentSize(input);
  assertZipExpansionBounds(input);
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(input); }
  catch { throw new DocumentParseError("INVALID_DOCX", "DOCX ZIP 容器损坏或无法读取。" ); }
  const documentXml = files["word/document.xml"];
  const contentTypes = files["[Content_Types].xml"];
  if (!documentXml || !contentTypes) throw new DocumentParseError("INVALID_DOCX", "文件不是有效的 DOCX 文档。" );
  const parsed = parseStructuredDocx(files, strFromU8(documentXml));
  const chunks: MaterialChunkDraft[] = [];
  let sectionPath: string[] = [];
  for (const block of parsed.document.blocks) {
    const text = blockToPlainText(block).trim();
    if (!text) continue;
    if (block.type === "heading") sectionPath = [...sectionPath.slice(0, Math.max(0, (block.level ?? 1) - 1)), text];
    chunks.push({
      ordinal: chunks.length,
      text,
      location: block.sourceLocator,
      metadata: { blockId: block.id, blockType: block.type, sectionPath },
    });
  }
  return { parserKey: "builtin-docx", parserVersion: "1.0.0", recordCount: parsed.document.blocks.length, chunks, structuredDocument: parsed.document, assets: parsed.assets, warnings: parsed.warnings };
}

function parseStructuredDocx(files: Record<string, Uint8Array>, xml: string): { document: DocumentContent; assets: ParsedDocumentAsset[]; warnings: string[] } {
  const relationships = relationshipMap(files["word/_rels/document.xml.rels"] ? strFromU8(files["word/_rels/document.xml.rels"]) : "");
  const assets: ParsedDocumentAsset[] = [];
  const warnings: string[] = [];
  const blocks: DocumentBlock[] = [];
  let paragraph = 0;
  let table = 0;
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/u.exec(xml)?.[1] ?? xml;
  const topBlocks = [...body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/gu)];
  topBlocks.forEach((match, blockIndex) => {
    if (match[1] === "tbl") {
      table += 1;
      blocks.push(parseTable(match[0], blockIndex, table));
      return;
    }
    paragraph += 1;
    const textBlock = parseParagraph(match[0], blockIndex, paragraph);
    if (textBlock.runs.some((run) => run.text)) blocks.push(textBlock);
    for (const image of parseImages(match[0], blockIndex, paragraph, relationships, files, assets)) blocks.push(image);
  });
  if (/<w:txbxContent\b/u.test(xml)) warnings.push("UNSUPPORTED_TEXT_BOX");
  if (/<w:smartTag\b|<dgm:/u.test(xml)) warnings.push("UNSUPPORTED_SMART_ART");
  if (/<w:ins\b|<w:del\b/u.test(xml)) warnings.push("UNSUPPORTED_TRACKED_CHANGES");
  return { document: { version: 1, blocks }, assets, warnings };
}

function parseParagraph(xml: string, blockIndex: number, paragraph: number): TextBlock {
  const styleName = /<w:pStyle\s+w:val="([^"]+)"/u.exec(xml)?.[1];
  const headingMatch = /^(?:Heading|标题)\s*([1-6])/iu.exec(styleName ?? "");
  const numberingId = /<w:numId\s+w:val="([^"]+)"/u.exec(xml)?.[1];
  const level = Number(/<w:ilvl\s+w:val="(\d+)"/u.exec(xml)?.[1] ?? 0);
  const alignmentValue = /<w:jc\s+w:val="([^"]+)"/u.exec(xml)?.[1];
  const alignment = alignmentValue === "both" ? "justify" : (["left", "center", "right", "justify"].includes(alignmentValue ?? "") ? alignmentValue as TextBlock["alignment"] : undefined);
  const runs = [...xml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/gu)].map((match) => parseRun(match[0])).filter((run) => run.text);
  const base = { id: crypto.randomUUID(), runs, styleName, alignment, sourceLocator: { part: "word/document.xml", blockIndex, paragraph } };
  if (numberingId) return { ...base, type: "list_item", ordered: true, level, numberingId };
  if (headingMatch) return { ...base, type: "heading", level: Number(headingMatch[1]) };
  return { ...base, type: "paragraph" };
}

function parseRun(xml: string): TextRun {
  const properties = /<w:rPr\b[\s\S]*?<\/w:rPr>/u.exec(xml)?.[0] ?? "";
  const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/gu)].map((item) => item[1] !== undefined ? decodeXml(item[1]) : item[0].startsWith("<w:tab") ? "\t" : "\n").join("");
  const vertical = /<w:vertAlign\s+w:val="([^"]+)"/u.exec(properties)?.[1];
  const size = Number(/<w:sz\s+w:val="([\d.]+)"/u.exec(properties)?.[1]);
  return {
    text,
    bold: /<w:b(?:\s|\/|>)/u.test(properties),
    italic: /<w:i(?:\s|\/|>)/u.test(properties),
    underline: /<w:u(?:\s|\/|>)/u.test(properties),
    fontFamily: /<w:rFonts[^>]*w:(?:ascii|eastAsia)="([^"]+)"/u.exec(properties)?.[1],
    fontSizePt: Number.isFinite(size) && size > 0 ? size / 2 : undefined,
    color: /<w:color\s+w:val="([0-9A-Fa-f]{6})"/u.exec(properties)?.[1],
    superscript: vertical === "superscript" || undefined,
    subscript: vertical === "subscript" || undefined,
  };
}

function parseTable(xml: string, blockIndex: number, table: number): DocumentBlock {
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gu)].map((rowMatch, rowIndex) => ({
    cells: [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gu)].map((cellMatch, cellIndex) => ({
      blocks: [...cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((paragraphMatch, paragraphIndex) => parseParagraph(paragraphMatch[0], blockIndex, paragraphIndex + 1)),
      colSpan: Number(/<w:gridSpan\s+w:val="(\d+)"/u.exec(cellMatch[0])?.[1] ?? 1),
      rowSpan: /<w:vMerge(?:\s+w:val="restart")?\s*\/>/u.test(cellMatch[0]) ? 1 : undefined,
    })),
  }));
  return { id: crypto.randomUUID(), type: "table", rows, styleName: /<w:tblStyle\s+w:val="([^"]+)"/u.exec(xml)?.[1], sourceLocator: { part: "word/document.xml", blockIndex, table } };
}

function relationshipMap(xml: string): Map<string, string> {
  return new Map([...xml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gu)].map((match) => [match[1], match[2].replace(/^\.\.\//u, "")]));
}

function parseImages(xml: string, blockIndex: number, paragraph: number, relationships: Map<string, string>, files: Record<string, Uint8Array>, assets: ParsedDocumentAsset[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  for (const match of xml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"[^>]*>/gu)) {
    const relationshipId = match[1];
    const target = relationships.get(relationshipId);
    if (!target) continue;
    const path = target.startsWith("word/") ? target : `word/${target}`;
    const bytes = files[path];
    if (!bytes) continue;
    const filename = path.split("/").pop() ?? "image.bin";
    const assetId = crypto.randomUUID();
    assets.push({ id: assetId, relationshipId, filename, contentType: imageContentType(filename), bytes });
    const extent = /<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/u.exec(xml);
    result.push({ id: crypto.randomUUID(), type: "image", assetId, relationshipId, altText: /<wp:docPr[^>]*descr="([^"]*)"/u.exec(xml)?.[1], width: extent ? Math.round(Number(extent[1]) / 9525) : undefined, height: extent ? Math.round(Number(extent[2]) / 9525) : undefined, sourceLocator: { part: "word/document.xml", blockIndex, paragraph, relationshipId } });
  }
  return result;
}

function imageContentType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

export async function parseTextPdf(bytes: ArrayBuffer | Uint8Array): Promise<DocumentParseResult> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  assertDocumentSize(input);
  try {
    const pdf = await withTimeout(
      getDocumentProxy(input, { maxImageSize: 16_777_216 }),
      PDF_TIMEOUT_MS,
    );
    if (pdf.numPages > MAX_PDF_PAGES) throw new DocumentParseError("PDF_PAGE_LIMIT", "PDF 超过 300 页解析上限。" );
    const result = await withTimeout(extractText(pdf), PDF_TIMEOUT_MS);
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    const chunks = pages.map((text, index) => ({ ordinal: index, text: text.trim(), location: { page: index + 1 }, metadata: {} })).filter((item) => item.text);
    if (!chunks.length) throw new DocumentParseError("SCANNED_PDF_OCR_REQUIRED", "PDF 未包含可提取文本；扫描件 OCR 尚未实现。" );
    return { parserKey: "unpdf-text", parserVersion: "1.0.0", recordCount: chunks.length, chunks };
  } catch (error) {
    if (error instanceof DocumentParseError) throw error;
    throw new DocumentParseError("PDF_PARSE_FAILED", "文本型 PDF 解析失败。" );
  }
}

function assertDocumentSize(input: Uint8Array) {
  if (input.byteLength > MAX_DOCUMENT_PARSE_BYTES) throw new DocumentParseError("DOCUMENT_TOO_LARGE", "DOCX/PDF 解析输入不得超过 15 MB。" );
}

export function assertZipExpansionBounds(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let entries = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let offset = 0; offset + 46 <= input.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    entries += 1;
    totalCompressed += view.getUint32(offset + 20, true);
    totalUncompressed += view.getUint32(offset + 24, true);
  }
  if (!entries || entries > MAX_ZIP_ENTRIES || totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES || totalUncompressed > Math.max(totalCompressed * 100, 1024 * 1024)) {
    throw new DocumentParseError("ZIP_EXPANSION_LIMIT", "DOCX 压缩包超过安全展开限制。" );
  }
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DocumentParseError("PDF_TIMEOUT", "PDF 解析超过 30 秒上限。" )), timeoutMs); });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
