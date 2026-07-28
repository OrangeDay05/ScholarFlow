import { strFromU8, unzipSync } from "fflate";
import { assertZipExpansionBounds, DocumentParseError } from "./document-parsers";
import type { DocumentParseResult } from "./document-parsers";

const MAX_XLSX_BYTES = 15 * 1024 * 1024;

export function parseXlsx(bytes: ArrayBuffer | Uint8Array): DocumentParseResult {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.byteLength > MAX_XLSX_BYTES) throw new DocumentParseError("DOCUMENT_TOO_LARGE", "XLSX 解析输入不得超过 15 MB。" );
  assertZipExpansionBounds(input);
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(input); }
  catch { throw new DocumentParseError("INVALID_DOCX", "XLSX ZIP 容器损坏或无法读取。" ); }
  const workbookBytes = files["xl/workbook.xml"];
  const relationsBytes = files["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !relationsBytes) throw new Error("文件不是有效的 XLSX 工作簿。" );
  const workbook = strFromU8(workbookBytes);
  const relations = strFromU8(relationsBytes);
  const relationMap = new Map([...relations.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gu)].map((match) => [match[1], normalizeSheetTarget(match[2])]));
  const shared = parseSharedStrings(files["xl/sharedStrings.xml"]);
  const chunks: DocumentParseResult["chunks"] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"[^>]*\/?\s*>/gu)) {
    const sheetName = decodeXml(sheet[1]);
    const path = relationMap.get(sheet[2]);
    if (!path || !files[path]) continue;
    const xml = strFromU8(files[path]);
    for (const row of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/gu)) {
      const values: Record<string, string> = {};
      const formulas: Record<string, string> = {};
      for (const cell of row[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
        const reference = /\br="([A-Z]+\d+)"/u.exec(cell[1])?.[1];
        if (!reference) continue;
        const type = /\bt="([^"]+)"/u.exec(cell[1])?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/u.exec(cell[2])?.[1] ?? /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/u.exec(cell[2])?.[1] ?? "";
        values[reference] = type === "s" ? shared[Number(raw)] ?? "" : decodeXml(raw);
        const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/u.exec(cell[2])?.[1];
        if (formula) formulas[reference] = decodeXml(formula);
      }
      if (!Object.keys(values).length && !Object.keys(formulas).length) continue;
      chunks.push({
        ordinal: chunks.length,
        text: Object.entries(values).map(([cell, value]) => `${cell}: ${value}`).join("\n"),
        location: { sheet: sheetName, row: Number(row[1]), cells: Object.keys(values) },
        metadata: { values, formulas, formulasExecuted: false },
      });
    }
  }
  return { parserKey: "builtin-xlsx", parserVersion: "1.0.0", recordCount: chunks.length, chunks };
}

export function registerImageAsset(bytes: ArrayBuffer | Uint8Array, extension: string): DocumentParseResult {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const normalized = extension.toLowerCase().replace(/^\./u, "");
  const dimensions = normalized === "png" ? pngDimensions(input) : jpegDimensions(input);
  return {
    parserKey: "builtin-image-asset",
    parserVersion: "1.0.0",
    recordCount: 1,
    chunks: [{ ordinal: 0, text: "图片资产（未执行图像理解）", location: { asset: "original" }, metadata: { extension: normalized, ...dimensions, imageUnderstanding: false } }],
  };
}

function parseSharedStrings(bytes?: Uint8Array): string[] {
  if (!bytes) return [];
  return [...strFromU8(bytes).matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((item) => [...item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)].map((text) => decodeXml(text[1])).join(""));
}

function normalizeSheetTarget(target: string): string {
  const value = target.replace(/^\//u, "").replace(/^\.\.\//u, "");
  return value.startsWith("xl/") ? value : `xl/${value}`;
}

function pngDimensions(input: Uint8Array) {
  if (input.length < 24 || input[0] !== 0x89 || input[1] !== 0x50) throw new Error("PNG 文件头无效。" );
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(input: Uint8Array) {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new Error("JPEG 文件头无效。" );
  for (let offset = 2; offset + 9 < input.length;) {
    if (input[offset] !== 0xff) { offset += 1; continue; }
    const marker = input[offset + 1];
    const length = (input[offset + 2] << 8) | input[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: (input[offset + 5] << 8) | input[offset + 6], width: (input[offset + 7] << 8) | input[offset + 8] };
    if (length < 2) break;
    offset += length + 2;
  }
  throw new Error("JPEG 缺少可识别的尺寸段。" );
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}
