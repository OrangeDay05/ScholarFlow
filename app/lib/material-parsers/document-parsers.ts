import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import type { MaterialChunkDraft } from "./text-reference-parsers";

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
  const xml = strFromU8(documentXml);
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)];
  const chunks: MaterialChunkDraft[] = [];
  paragraphs.forEach((match, paragraphIndex) => {
    const block = match[0];
    const text = [...block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
      .map((item) => decodeXml(item[1])).join("");
    if (!text.trim()) return;
    const style = /<w:pStyle\s+w:val="([^"]+)"/u.exec(block)?.[1] ?? null;
    chunks.push({
      ordinal: chunks.length,
      text,
      location: { part: "word/document.xml", paragraph: paragraphIndex + 1 },
      metadata: { style, heading: Boolean(style && /^Heading|标题/u.test(style)) },
    });
  });
  return { parserKey: "builtin-docx", parserVersion: "1.0.0", recordCount: chunks.length, chunks };
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

function assertZipExpansionBounds(input: Uint8Array) {
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
