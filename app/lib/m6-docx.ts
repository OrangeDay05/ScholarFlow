import { strToU8, zipSync } from "fflate";

export type M6DocxSection = { title: string; content: string };
export type M6DocxReference = { citationKey: string; title: string; authors: string[]; year: number | null; source: string | null; doi: string | null };

export function createM6Docx(input: { title: string; sections: M6DocxSection[]; references: M6DocxReference[] }): Uint8Array<ArrayBuffer> {
  const body = [
    paragraph(input.title, "Title"),
    ...input.sections.flatMap((section) => [paragraph(section.title, "Heading1"), ...splitParagraphs(section.content).map((text) => paragraph(text))]),
    ...(input.references.length ? [paragraph("参考文献", "Heading1"), ...input.references.map((reference) => paragraph(formatReference(reference)))] : []),
  ].join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "word/document.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
    "word/styles.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`),
    "word/_rels/document.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`),
    "docProps/core.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(input.title)}</dc:title><dc:creator>ScholarFlow</dc:creator></cp:coreProperties>`),
  };
  return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}

function paragraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}
function splitParagraphs(value: string): string[] { return value.replace(/\r\n?/gu, "\n").split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean); }
function formatReference(reference: M6DocxReference): string { const authors = reference.authors.join(", ") || "作者待核验"; const year = reference.year ?? "年份待核验"; const source = reference.source ? ` ${reference.source}.` : ""; const doi = reference.doi ? ` https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")}` : ""; return `[${reference.citationKey}] ${authors} (${year}). ${reference.title}.${source}${doi}`; }
function escapeXml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function xml(value: string): Uint8Array { return strToU8(value); }
