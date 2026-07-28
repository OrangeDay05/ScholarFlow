export const TEXT_REFERENCE_PARSER_VERSION = "1.0.0";
export const MAX_TEXT_PARSE_BYTES = 5 * 1024 * 1024;
export const MAX_PARSE_RECORDS = 10_000;

export type TextReferenceFormat = "TXT" | "CSV" | "BIBTEX" | "RIS";
export type MaterialParseFormat = TextReferenceFormat | "DOCX" | "PDF" | "XLSX" | "IMAGE";

export type MaterialChunkDraft = {
  ordinal: number;
  text: string;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type TextReferenceParseResult = {
  format: TextReferenceFormat;
  parserKey: string;
  parserVersion: string;
  recordCount: number;
  chunks: MaterialChunkDraft[];
};

export class MaterialParseError extends Error {
  readonly code:
    | "UNSUPPORTED_FORMAT"
    | "PARSE_INPUT_TOO_LARGE"
    | "INVALID_UTF8"
    | "MALFORMED_CSV"
    | "MALFORMED_BIBTEX"
    | "MALFORMED_RIS"
    | "TOO_MANY_RECORDS";

  constructor(
    code:
      | "UNSUPPORTED_FORMAT"
      | "PARSE_INPUT_TOO_LARGE"
      | "INVALID_UTF8"
      | "MALFORMED_CSV"
      | "MALFORMED_BIBTEX"
      | "MALFORMED_RIS"
      | "TOO_MANY_RECORDS",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function formatFromExtension(extension: string): MaterialParseFormat {
  const normalized = extension.toLowerCase().replace(/^\./u, "");
  if (normalized === "txt") return "TXT";
  if (normalized === "csv") return "CSV";
  if (normalized === "bib" || normalized === "bibtex") return "BIBTEX";
  if (normalized === "ris") return "RIS";
  if (normalized === "docx") return "DOCX";
  if (normalized === "pdf") return "PDF";
  if (normalized === "xlsx") return "XLSX";
  if (["png", "jpg", "jpeg"].includes(normalized)) return "IMAGE";
  throw new MaterialParseError("UNSUPPORTED_FORMAT", "当前文件格式没有可用解析器。" );
}

export function parseTextReferenceMaterial(
  bytes: ArrayBuffer | Uint8Array,
  format: TextReferenceFormat,
): TextReferenceParseResult {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength > MAX_TEXT_PARSE_BYTES) {
    throw new MaterialParseError("PARSE_INPUT_TOO_LARGE", "文本解析输入不得超过 5 MB。" );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(view).replace(/^\uFEFF/u, "");
  } catch {
    throw new MaterialParseError("INVALID_UTF8", "当前文本解析仅接受有效 UTF-8。" );
  }
  const chunks =
    format === "TXT"
      ? parseTxt(text)
      : format === "CSV"
        ? parseCsv(text)
        : format === "BIBTEX"
          ? parseBibtex(text)
          : parseRis(text);
  if (chunks.length > MAX_PARSE_RECORDS) {
    throw new MaterialParseError("TOO_MANY_RECORDS", "解析记录数超过 10,000 条上限。" );
  }
  return {
    format,
    parserKey: `builtin-${format.toLowerCase()}`,
    parserVersion: TEXT_REFERENCE_PARSER_VERSION,
    recordCount: chunks.length,
    chunks: chunks.map((chunk, ordinal) => ({ ...chunk, ordinal })),
  };
}

function parseTxt(text: string): Omit<MaterialChunkDraft, "ordinal">[] {
  const lines = text.split(/\r?\n/u);
  const chunks: Omit<MaterialChunkDraft, "ordinal">[] = [];
  let start = -1;
  let buffer: string[] = [];
  const flush = (end: number) => {
    const value = buffer.join("\n").trim();
    if (value) chunks.push({ text: value, location: { lineStart: start + 1, lineEnd: end + 1 }, metadata: {} });
    start = -1;
    buffer = [];
  };
  lines.forEach((line, index) => {
    if (!line.trim()) {
      if (buffer.length) flush(index - 1);
      return;
    }
    if (start < 0) start = index;
    buffer.push(line);
  });
  if (buffer.length) flush(lines.length - 1);
  return chunks;
}

function parseCsv(text: string): Omit<MaterialChunkDraft, "ordinal">[] {
  const rows: { values: string[]; lineStart: number; lineEnd: number }[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else { field += char; if (char === "\n") line += 1; }
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/u, "")); rows.push({ values: row, lineStart: rowStart, lineEnd: line }); row = []; field = ""; line += 1; rowStart = line; }
    else field += char;
  }
  if (quoted) throw new MaterialParseError("MALFORMED_CSV", "CSV 存在未闭合的引号字段。" );
  if (field.length || row.length) { row.push(field.replace(/\r$/u, "")); rows.push({ values: row, lineStart: rowStart, lineEnd: line }); }
  if (!rows.length) return [];
  const headers = rows[0].values.map((value, index) => value.trim() || `column_${index + 1}`);
  return rows.slice(1).filter((item) => item.values.some(Boolean)).map((item, index) => ({
    text: headers.map((header, column) => `${header}: ${item.values[column] ?? ""}`).join("\n"),
    location: { row: index + 2, lineStart: item.lineStart, lineEnd: item.lineEnd, fields: headers },
    metadata: { values: Object.fromEntries(headers.map((header, column) => [header, item.values[column] ?? ""])) },
  }));
}

function parseBibtex(text: string): Omit<MaterialChunkDraft, "ordinal">[] {
  const chunks: Omit<MaterialChunkDraft, "ordinal">[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const match = /@([a-zA-Z]+)\s*([{(])/gu.exec(text.slice(cursor));
    if (!match) break;
    const start = cursor + (match.index ?? 0);
    const openIndex = start + match[0].length - 1;
    const close = match[2] === "{" ? "}" : ")";
    let depth = 1;
    let quoted = false;
    let end = openIndex + 1;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (char === '"' && text[end - 1] !== "\\") quoted = !quoted;
      if (!quoted && char === match[2]) depth += 1;
      if (!quoted && char === close) depth -= 1;
      if (depth === 0) { end += 1; break; }
    }
    if (depth !== 0) throw new MaterialParseError("MALFORMED_BIBTEX", "BibTeX 存在未闭合的记录。" );
    const raw = text.slice(start, end).trim();
    const inner = raw.slice(raw.indexOf(match[2]) + 1, -1);
    const comma = inner.indexOf(",");
    const citationKey = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    if (!citationKey) throw new MaterialParseError("MALFORMED_BIBTEX", "BibTeX 记录缺少 citation key。" );
    chunks.push({
      text: raw,
      location: { lineStart: lineAt(text, start), lineEnd: lineAt(text, end - 1), record: chunks.length + 1 },
      metadata: { entryType: match[1].toLowerCase(), citationKey },
    });
    cursor = end;
  }
  if (text.trim() && !chunks.length) throw new MaterialParseError("MALFORMED_BIBTEX", "未找到有效 BibTeX 记录。" );
  return chunks;
}

function parseRis(text: string): Omit<MaterialChunkDraft, "ordinal">[] {
  const lines = text.split(/\r?\n/u);
  const chunks: Omit<MaterialChunkDraft, "ordinal">[] = [];
  let start = -1;
  let record: string[] = [];
  lines.forEach((line, index) => {
    if (/^TY  - /u.test(line)) { if (record.length) throw new MaterialParseError("MALFORMED_RIS", "RIS 记录缺少 ER 结束标记。" ); start = index; record = [line]; return; }
    if (start < 0) { if (line.trim()) throw new MaterialParseError("MALFORMED_RIS", "RIS 记录必须以 TY 开始。" ); return; }
    record.push(line);
    if (/^ER  -\s*$/u.test(line)) {
      const metadata: Record<string, string[]> = {};
      for (const item of record) { const match = /^([A-Z0-9]{2})  -\s?(.*)$/u.exec(item); if (match) (metadata[match[1]] ??= []).push(match[2]); }
      chunks.push({ text: record.join("\n"), location: { lineStart: start + 1, lineEnd: index + 1, record: chunks.length + 1 }, metadata });
      start = -1; record = [];
    }
  });
  if (record.length) throw new MaterialParseError("MALFORMED_RIS", "RIS 记录缺少 ER 结束标记。" );
  return chunks;
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}
