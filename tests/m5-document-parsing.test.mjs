import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import test from "node:test";
import { parseDocx, parseTextPdf } from "../app/lib/material-parsers/document-parsers.ts";

test("DOCX parser preserves paragraph order, heading style and OOXML location", () => {
  const docx = zipSync({
    "[Content_Types].xml": strToU8("<Types></Types>"),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>研究方法</w:t></w:r></w:p>
      <w:p><w:r><w:t>第一段 &amp; 证据</w:t></w:r></w:p>
    </w:body></w:document>`),
  });
  const result = parseDocx(docx);
  assert.equal(result.recordCount, 2);
  assert.equal(result.chunks[0].metadata.heading, true);
  assert.equal(result.chunks[1].text, "第一段 & 证据");
  assert.deepEqual(result.chunks[1].location, { part: "word/document.xml", paragraph: 2 });
});

test("DOCX parser rejects non-DOCX ZIP containers", () => {
  const otherZip = zipSync({ "data.txt": strToU8("not docx") });
  assert.throws(() => parseDocx(otherZip), /DOCX/u);
});

test("text PDF parser extracts per-page text and page location", async () => {
  const result = await parseTextPdf(minimalPdf("Verified source text"));
  assert.equal(result.recordCount, 1);
  assert.deepEqual(result.chunks[0].location, { page: 1 });
  assert.match(result.chunks[0].text, /Verified source text/u);
});

test("text PDF parser does not pretend scanned or empty PDFs are parsed", async () => {
  await assert.rejects(() => parseTextPdf(minimalPdf("")), /OCR/u);
});

function minimalPdf(text) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(pdf);
}
