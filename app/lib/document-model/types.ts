export type SourceLocator = {
  part: string;
  blockIndex: number;
  paragraph?: number;
  table?: number;
  row?: number;
  cell?: number;
  relationshipId?: string;
};

export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
  fontSizePt?: number;
  color?: string;
  superscript?: boolean;
  subscript?: boolean;
};

export type TextBlock = {
  id: string;
  type: "paragraph" | "heading" | "list_item";
  level?: number;
  runs: TextRun[];
  styleName?: string;
  alignment?: "left" | "center" | "right" | "justify";
  ordered?: boolean;
  numberingId?: string;
  bulletOrNumberText?: string;
  sourceLocator: SourceLocator;
};

export type TableCell = { blocks: Array<TextBlock>; rowSpan?: number; colSpan?: number };
export type TableBlock = {
  id: string;
  type: "table";
  rows: Array<{ cells: TableCell[] }>;
  styleName?: string;
  sourceLocator: SourceLocator;
};
export type ImageBlock = {
  id: string;
  type: "image";
  assetId: string;
  relationshipId?: string;
  altText?: string;
  width?: number;
  height?: number;
  caption?: string;
  sourceLocator: SourceLocator;
};
export type DocumentBlock = TextBlock | TableBlock | ImageBlock;
export type DocumentContent = { version: 1; blocks: DocumentBlock[] };

export type ParsedDocumentAsset = {
  id: string;
  relationshipId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export type StructuredParseResult = {
  document: DocumentContent;
  assets: ParsedDocumentAsset[];
  warnings: string[];
};
