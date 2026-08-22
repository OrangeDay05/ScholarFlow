import { strToU8, zipSync } from "fflate";
import type {
  DocumentBlock,
  DocumentContent,
  ImageBlock,
  TableBlock,
  TextBlock,
  TextRun,
} from "./document-model/types";

export type M6DocxSection = {
  title: string;
  slug?: string;
  content: string;
  document?: DocumentContent | null;
};
export type M6DocxReference = {
  citationKey: string;
  title: string;
  authors: string[];
  year: number | null;
  source: string | null;
  doi: string | null;
};
export type M6DocxAsset = {
  id: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};
export type M6HeadingPrefixStyle = "none" | "chinese_dunhao" | "arabic_dunhao" | "arabic_dot";

type ImageRelationship = {
  asset: M6DocxAsset;
  relationshipId: string;
  mediaPath: string;
};

const PAGE_CONTENT_WIDTH_DXA = 9_026;

export function createM6Docx(input: {
  title: string;
  sections: M6DocxSection[];
  references: M6DocxReference[];
  assets?: M6DocxAsset[];
  headingPrefixStyle?: M6HeadingPrefixStyle;
}): Uint8Array<ArrayBuffer> {
  const assetsById = new Map((input.assets ?? []).map((asset) => [asset.id, asset]));
  const imageRelationships = buildImageRelationships(input.sections, assetsById);
  const relationshipsByAssetId = new Map(imageRelationships.map((item) => [item.asset.id, item]));
  let drawingId = 0;
  let listSequence = 0;
  let numberedSectionIndex = 0;
  const hasStructuredFrontMatter = input.sections.some(
    (section) => section.slug === "front-matter" && section.document?.blocks.length,
  );
  const body = [
    ...(hasStructuredFrontMatter ? [] : [styledParagraph(input.title, "Title")]),
    ...input.sections.flatMap((section) => {
      const headingTitle = shouldNumberSection(section.slug)
        ? formatSectionHeading(section.title, ++numberedSectionIndex, input.headingPrefixStyle ?? "none")
        : section.title;
      return renderSection(
        section,
        headingTitle,
        relationshipsByAssetId,
        () => ++drawingId,
        (ordered) => (ordered ? 2 : 100) + listSequence++,
      );
    }),
    ...(input.references.length
      ? [
          styledParagraph("参考文献", "Heading1"),
          ...input.references.map((reference) => styledParagraph(formatReference(reference), "Bibliography")),
        ]
      : []),
  ].join("");
  const imageDefaults = [...new Set(imageRelationships.map((item) => extensionOf(item.asset.filename)))].filter(Boolean);
  const documentRelationships = [
    relationship("rIdStyles", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", "styles.xml"),
    relationship("rIdNumbering", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering", "numbering.xml"),
    ...imageRelationships.map((item) => relationship(
      item.relationshipId,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      item.mediaPath.replace(/^word\//u, ""),
    )),
  ].join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults.map((extension) => `<Default Extension="${escapeAttribute(extension)}" ContentType="${escapeAttribute(contentTypeForExtension(extension))}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "word/document.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:cols w:space="720"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`),
    "word/styles.xml": xml(stylesXml()),
    "word/numbering.xml": xml(numberingXml()),
    "word/_rels/document.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships}</Relationships>`),
    "docProps/core.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(input.title)}</dc:title><dc:creator>ScholarFlow</dc:creator></cp:coreProperties>`),
  };
  for (const item of imageRelationships) files[item.mediaPath] = item.asset.bytes;
  return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}

function renderSection(
  section: M6DocxSection,
  headingTitle: string,
  relationships: Map<string, ImageRelationship>,
  nextDrawingId: () => number,
  nextListId: (ordered: boolean) => number,
): string[] {
  const document = section.document;
  const heading = section.slug === "front-matter" ? [] : [styledParagraph(headingTitle, "Heading1")];
  if (!document?.blocks.length) {
    const paragraphs = splitParagraphs(section.content);
    const bodyParagraphs = paragraphs[0] && isSectionTitleLine(paragraphs[0], section.title)
      ? paragraphs.slice(1)
      : paragraphs;
    return [...heading, ...bodyParagraphs.map((text) => bodyParagraph([{ text }]))];
  }
  let activeListId: number | undefined;
  let activeListOrdered: boolean | undefined;
  const sourceBlocks = document.blocks[0] && isSectionTitleLine(blockText(document.blocks[0]), section.title)
    ? document.blocks.slice(1)
    : document.blocks;
  const blocks = sourceBlocks.map((block) => {
    if (block.type === "list_item") {
      const ordered = block.ordered !== false;
      if (activeListId === undefined || activeListOrdered !== ordered) {
        activeListId = nextListId(ordered);
        activeListOrdered = ordered;
      }
      return textBlockXml(block, { sectionSlug: section.slug, numId: activeListId });
    }
    activeListId = undefined;
    activeListOrdered = undefined;
    return renderBlock(block, relationships, nextDrawingId, section.slug);
  });
  return [...heading, ...blocks];
}

function shouldNumberSection(slug?: string): boolean {
  return !new Set(["front-matter", "abstract", "keywords", "references"]).has(slug ?? "");
}

function formatSectionHeading(title: string, index: number, style: M6HeadingPrefixStyle): string {
  const cleanTitle = title.trim().replace(/^(?:[一二三四五六七八九十百]+|\d+)[、.．]\s*/u, "");
  if (style === "chinese_dunhao") return `${chineseNumber(index)}、${cleanTitle}`;
  if (style === "arabic_dunhao") return `${index}、${cleanTitle}`;
  if (style === "arabic_dot") return `${index}. ${cleanTitle}`;
  return cleanTitle;
}

function chineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : digits[value];
  if (value < 20) return `十${digits[value % 10]}`;
  if (value < 100) return `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ""}`;
  return String(value);
}

function isSectionTitleLine(value: string, title: string): boolean {
  const stripPrefix = (text: string) => text.trim().replace(/^(?:[一二三四五六七八九十百]+|\d+)[、.．]\s*/u, "");
  return stripPrefix(value) === stripPrefix(title);
}

function renderBlock(
  block: DocumentBlock,
  relationships: Map<string, ImageRelationship>,
  nextDrawingId: () => number,
  sectionSlug?: string,
): string {
  if (block.type === "table") return tableXml(block);
  if (block.type === "image") return imageXml(block, relationships.get(block.assetId), nextDrawingId());
  return textBlockXml(block, { sectionSlug });
}

function textBlockXml(block: TextBlock, options: { inTable?: boolean; sectionSlug?: string; numId?: number } = {}): string {
  const style = block.type === "heading"
    ? `Heading${Math.min(6, Math.max(1, block.level ?? 1))}`
    : block.type === "list_item"
      ? "ListParagraph"
      : block.styleName;
  const properties: string[] = [];
  if (style) properties.push(`<w:pStyle w:val="${escapeAttribute(style)}"/>`);
  if (block.type === "list_item") {
    properties.push(`<w:numPr><w:ilvl w:val="${Math.min(8, Math.max(0, block.level ?? 0))}"/><w:numId w:val="${options.numId ?? (block.ordered === false ? 100 : 2)}"/></w:numPr>`);
  }
  const alignment = block.alignment === "justify" ? "both" : block.alignment;
  if (alignment) properties.push(`<w:jc w:val="${alignment}"/>`);
  if (block.type === "paragraph" && !options.inTable) {
    const compact = options.sectionSlug === "front-matter" || options.sectionSlug === "keywords";
    const references = options.sectionSlug === "references";
    const referenceHeading = references && block.runs.some((run) => run.text.trim()) && block.runs.every((run) => !run.text.trim() || run.bold);
    properties.push(`<w:spacing w:after="${compact ? 80 : 120}" w:line="360" w:lineRule="auto"/>`);
    if (references) {
      if (!referenceHeading) properties.push('<w:ind w:hanging="360"/>');
      if (!block.alignment) properties.push('<w:jc w:val="left"/>');
    } else if (!block.alignment && !compact) {
      properties.push("<w:ind w:firstLineChars=\"200\" w:firstLine=\"480\"/>", "<w:jc w:val=\"both\"/>");
    }
  }
  const pPr = properties.length ? `<w:pPr>${properties.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${block.runs.map(runXml).join("") || "<w:r><w:t/></w:r>"}</w:p>`;
}

function bodyParagraph(runs: TextRun[]): string {
  return `<w:p><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr>${runs.map(runXml).join("")}</w:p>`;
}

function styledParagraph(text: string, style: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${escapeAttribute(style)}"/></w:pPr>${runXml({ text })}</w:p>`;
}

function runXml(run: TextRun): string {
  const properties: string[] = [];
  if (run.bold) properties.push("<w:b/>");
  if (run.italic) properties.push("<w:i/>");
  if (run.underline) properties.push('<w:u w:val="single"/>');
  if (run.fontFamily) properties.push(`<w:rFonts w:ascii="${escapeAttribute(run.fontFamily)}" w:hAnsi="${escapeAttribute(run.fontFamily)}" w:eastAsia="${escapeAttribute(run.fontFamily)}"/>`);
  if (run.fontSizePt && Number.isFinite(run.fontSizePt)) {
    const halfPoints = Math.max(2, Math.round(run.fontSizePt * 2));
    properties.push(`<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`);
  }
  if (run.color && /^[0-9A-Fa-f]{6}$/u.test(run.color)) properties.push(`<w:color w:val="${run.color.toUpperCase()}"/>`);
  if (run.superscript) properties.push('<w:vertAlign w:val="superscript"/>');
  if (run.subscript) properties.push('<w:vertAlign w:val="subscript"/>');
  return `<w:r>${properties.length ? `<w:rPr>${properties.join("")}</w:rPr>` : ""}${runTextXml(run.text)}</w:r>`;
}

function runTextXml(text: string): string {
  return text.split(/(\t|\n)/u).map((part) => {
    if (part === "\t") return "<w:tab/>";
    if (part === "\n") return "<w:br/>";
    return part ? `<w:t xml:space="preserve">${escapeXml(part)}</w:t>` : "";
  }).join("");
}

function tableXml(table: TableBlock): string {
  const columnCount = Math.max(1, ...table.rows.map((row) => row.cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan ?? 1), 0)));
  const baseWidth = Math.floor(PAGE_CONTENT_WIDTH_DXA / columnCount);
  const widths = Array.from({ length: columnCount }, (_, index) => index === columnCount - 1
    ? PAGE_CONTENT_WIDTH_DXA - baseWidth * (columnCount - 1)
    : baseWidth);
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  const rows = table.rows.map((row, rowIndex) => {
    let columnIndex = 0;
    const cells = row.cells.map((cell) => {
      const span = Math.max(1, cell.colSpan ?? 1);
      const width = widths.slice(columnIndex, columnIndex + span).reduce((sum, current) => sum + current, 0) || baseWidth * span;
      columnIndex += span;
      const cellProperties = [
        `<w:tcW w:w="${width}" w:type="dxa"/>`,
        span > 1 ? `<w:gridSpan w:val="${span}"/>` : "",
        '<w:vAlign w:val="center"/>',
        '<w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>',
        rowIndex === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E8F1EC"/>' : "",
      ].join("");
      const blocks = cell.blocks.length
        ? cell.blocks.map((block) => textBlockXml(block, { inTable: true })).join("")
        : "<w:p/>";
      return `<w:tc><w:tcPr>${cellProperties}</w:tcPr>${blocks}</w:tc>`;
    }).join("");
    return `<w:tr>${rowIndex === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ""}${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_CONTENT_WIDTH_DXA}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="7A8C82"/><w:left w:val="single" w:sz="6" w:color="7A8C82"/><w:bottom w:val="single" w:sz="6" w:color="7A8C82"/><w:right w:val="single" w:sz="6" w:color="7A8C82"/><w:insideH w:val="single" w:sz="4" w:color="B7C8BF"/><w:insideV w:val="single" w:sz="4" w:color="B7C8BF"/></w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

function imageXml(image: ImageBlock, relationship: ImageRelationship | undefined, drawingId: number): string {
  if (!relationship) return bodyParagraph([{ text: image.altText || image.caption || "[图片资源不可用]", italic: true, color: "666666" }]);
  const dimensions = imageDimensions(image);
  const name = escapeAttribute(image.altText || relationship.asset.filename || `图片 ${drawingId}`);
  const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${dimensions.cx}" cy="${dimensions.cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${drawingId}" name="${name}" descr="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${dimensions.cx}" cy="${dimensions.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="${image.caption ? 40 : 160}"/></w:pPr>${drawing}</w:p>${image.caption ? styledParagraph(image.caption, "Caption") : ""}`;
}

function imageDimensions(image: ImageBlock): { cx: number; cy: number } {
  const widthPx = image.width && image.width > 0 ? image.width : 480;
  const heightPx = image.height && image.height > 0 ? image.height : 320;
  const maxWidthPx = 590;
  const scale = Math.min(1, maxWidthPx / widthPx);
  return { cx: Math.round(widthPx * scale * 9_525), cy: Math.round(heightPx * scale * 9_525) };
}

function buildImageRelationships(
  sections: M6DocxSection[],
  assetsById: Map<string, M6DocxAsset>,
): ImageRelationship[] {
  const assetIds = [...new Set(sections.flatMap((section) => section.document?.blocks
    .filter((block): block is ImageBlock => block.type === "image")
    .map((block) => block.assetId) ?? []))];
  return assetIds.flatMap((assetId, index) => {
    const asset = assetsById.get(assetId);
    if (!asset) return [];
    const extension = extensionOf(asset.filename) || extensionForContentType(asset.contentType);
    return [{ asset, relationshipId: `rIdImage${index + 1}`, mediaPath: `word/media/image${index + 1}.${extension}` }];
  });
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${style("Normal", "Normal", "", "<w:spacing w:after=\"120\" w:line=\"360\" w:lineRule=\"auto\"/>", "")} ${style("Title", "Title", "Normal", '<w:jc w:val="center"/><w:spacing w:before="0" w:after="320"/><w:keepNext/>', '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="黑体"/><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/>')} ${headingStyle(1, 32, 320, 160)} ${headingStyle(2, 28, 280, 120)} ${headingStyle(3, 26, 240, 100)} ${headingStyle(4, 24, 200, 80)} ${headingStyle(5, 24, 180, 80)} ${headingStyle(6, 24, 160, 80)} ${style("ListParagraph", "List Paragraph", "Normal", '<w:spacing w:after="80" w:line="360" w:lineRule="auto"/><w:ind w:left="420"/>', "")} ${style("Caption", "Caption", "Normal", '<w:jc w:val="center"/><w:spacing w:before="40" w:after="160"/>', '<w:i/><w:color w:val="555555"/><w:sz w:val="21"/><w:szCs w:val="21"/>')} ${style("Bibliography", "Bibliography", "Normal", '<w:spacing w:after="80" w:line="320" w:lineRule="auto"/><w:ind w:hanging="360"/>', '<w:sz w:val="22"/><w:szCs w:val="22"/>')}</w:styles>`;
}

function style(id: string, name: string, basedOn: string, paragraphProperties: string, runProperties: string): string {
  return `<w:style w:type="paragraph"${id === "Normal" ? ' w:default="1"' : ""} w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}<w:qFormat/>${paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : ""}${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ""}</w:style>`;
}

function headingStyle(level: number, size: number, before: number, after: number): string {
  return style(`Heading${level}`, `heading ${level}`, "Normal", `<w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}"/><w:outlineLvl w:val="${level - 1}"/>`, `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="黑体"/><w:b/><w:color w:val="000000"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
}

function numberingXml(): string {
  const levels = Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl>`).join("");
  const orderedLevels = Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("");
  const orderedInstances = Array.from(
    { length: 96 },
    (_, index) =>
      `<w:num w:numId="${index + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
  ).join("");
  const bulletInstances = Array.from(
    { length: 96 },
    (_, index) =>
      `<w:num w:numId="${index + 100}"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${levels}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${orderedLevels}</w:abstractNum>${orderedInstances}${bulletInstances}</w:numbering>`;
}

function startsWithSectionTitle(text: string, title: string): boolean {
  const normalizedText = text.replace(/[\s【】\[\]：:、.．一二三四五六七八九十0-9()-]/gu, "").toLowerCase();
  const normalizedTitle = title.replace(/[\s【】\[\]：:、.．一二三四五六七八九十0-9()-]/gu, "").toLowerCase();
  return Boolean(normalizedTitle && normalizedText.startsWith(normalizedTitle));
}

function blockText(block: DocumentBlock): string {
  if (block.type === "image") return block.caption || block.altText || "";
  if (block.type === "table") return block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.blocks.flatMap((item) => item.runs.map((run) => run.text)))).join(" ");
  return block.runs.map((run) => run.text).join("");
}

function relationship(id: string, type: string, target: string): string {
  return `<Relationship Id="${escapeAttribute(id)}" Type="${escapeAttribute(type)}" Target="${escapeAttribute(target)}"/>`;
}

function splitParagraphs(value: string): string[] {
  return value.replace(/\r\n?/gu, "\n").split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean);
}

function formatReference(reference: M6DocxReference): string {
  const authors = reference.authors.join(", ") || "作者待核验";
  const year = reference.year ?? "年份待核验";
  const source = reference.source ? ` ${reference.source}.` : "";
  const doi = reference.doi ? ` https://doi.org/${reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")}` : "";
  return `[${reference.citationKey}] ${authors} (${year}). ${reference.title}.${source}${doi}`;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/gu, "") ?? "";
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/svg+xml") return "svg";
  return "bin";
}

function contentTypeForExtension(extension: string): string {
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function escapeAttribute(value: string): string { return escapeXml(value); }
function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function xml(value: string): Uint8Array { return strToU8(value); }
