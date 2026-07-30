export const M8_FIGURE_CATALOG = [
  { group: "distribution", label: "分布类", items: ["histogram", "density", "boxplot", "violin"] },
  { group: "comparison", label: "比较类", items: ["bar", "point", "errorbar", "forest"] },
  { group: "relationship", label: "关系类", items: ["scatter", "bubble", "regression"] },
  { group: "trend", label: "趋势类", items: ["line", "area"] },
  { group: "matrix", label: "矩阵类", items: ["heatmap", "correlation_heatmap"] },
  { group: "composition", label: "组合类", items: ["facet", "multi_panel"] },
] as const;

export const M8_STATISTICAL_FIGURE_TYPES = M8_FIGURE_CATALOG.flatMap((group) => group.items);
export const M8_IMPLEMENTED_FIGURE_TYPES = M8_STATISTICAL_FIGURE_TYPES;
export const M8_DIAGRAM_TYPES = ["mechanism_diagram", "theoretical_framework", "research_flow", "graphical_abstract", "research_infographic"] as const;

export type M8StatisticalFigureType = (typeof M8_STATISTICAL_FIGURE_TYPES)[number];
export type M8ImplementedFigureType = (typeof M8_IMPLEMENTED_FIGURE_TYPES)[number];
export type M8DiagramType = (typeof M8_DIAGRAM_TYPES)[number];
export type M8DatasetValue = string | number | boolean | null;
export type M8DatasetRow = Record<string, M8DatasetValue>;

export type M8ColumnSchema = {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "mixed";
  nullable: boolean;
  uniqueCount: number;
};

export type M8MappingByFigureType = {
  histogram: { value: string; group?: string; facetRow?: string; facetColumn?: string };
  density: { value: string; group?: string; facetRow?: string; facetColumn?: string };
  boxplot: { category: string; value: string; colorBy?: string; facetRow?: string; facetColumn?: string };
  violin: { category: string; value: string; colorBy?: string; facetRow?: string; facetColumn?: string };
  bar: { category: string; value: string; group?: string };
  point: { category: string; value: string; group?: string };
  errorbar: { category: string; estimate: string; error?: string; lower?: string; upper?: string; group?: string };
  forest: { label: string; estimate: string; lowerCI: string; upperCI: string; group?: string };
  scatter: { x: string; y: string; colorBy?: string; shapeBy?: string; facetRow?: string; facetColumn?: string };
  bubble: { x: string; y: string; size: string; colorBy?: string };
  regression: { x: string; y: string; group?: string; model: "linear" | "quadratic"; showConfidenceInterval: boolean };
  line: { x: string; y: string; group?: string; colorBy?: string };
  area: { x: string; y: string; group?: string };
  heatmap: { x: string; y: string; value: string };
  correlation_heatmap: { variables: string[] };
  facet: { x: string; y: string; facetRow?: string; facetColumn?: string; geometry: "point" | "line" | "bar" };
  multi_panel: { panelSpecs: Array<{ figureType: M8StatisticalFigureType; mapping: Record<string, unknown> }> };
};

export type M8PublicationPreset = "screen_preview" | "paper_single_column" | "paper_double_column";
export type M8PublicationSettings = {
  preset: M8PublicationPreset;
  width: number;
  height: number;
  unit: "in";
  dpi: number;
  fontFamily: string;
  baseFontSize: number;
  titleFontSize: number;
  axisFontSize: number;
  legendFontSize: number;
  lineWidth: number;
  markerSize: number;
  background: "transparent" | "white" | "paper";
  colorPalette: "default" | "colorblind_safe" | "grayscale" | "high_contrast";
  grayscaleCompatible: boolean;
  colorblindSafe: boolean;
  legendPosition: "best" | "top" | "right" | "bottom" | "none";
  outputFormats: Array<"png" | "svg" | "pdf" | "tiff">;
};

export const M8_PUBLICATION_PRESETS: Record<M8PublicationPreset, M8PublicationSettings> = {
  screen_preview: { preset: "screen_preview", width: 7.2, height: 4.6, unit: "in", dpi: 150, fontFamily: "sans-serif", baseFontSize: 10, titleFontSize: 14, axisFontSize: 10, legendFontSize: 9, lineWidth: 1.8, markerSize: 6, background: "paper", colorPalette: "colorblind_safe", grayscaleCompatible: false, colorblindSafe: true, legendPosition: "best", outputFormats: ["png"] },
  paper_single_column: { preset: "paper_single_column", width: 3.5, height: 3.0, unit: "in", dpi: 300, fontFamily: "sans-serif", baseFontSize: 8, titleFontSize: 10, axisFontSize: 8, legendFontSize: 7, lineWidth: 1.2, markerSize: 4, background: "white", colorPalette: "colorblind_safe", grayscaleCompatible: true, colorblindSafe: true, legendPosition: "best", outputFormats: ["png", "svg", "pdf", "tiff"] },
  paper_double_column: { preset: "paper_double_column", width: 7.2, height: 4.6, unit: "in", dpi: 300, fontFamily: "sans-serif", baseFontSize: 9, titleFontSize: 12, axisFontSize: 9, legendFontSize: 8, lineWidth: 1.5, markerSize: 5, background: "white", colorPalette: "colorblind_safe", grayscaleCompatible: true, colorblindSafe: true, legendPosition: "best", outputFormats: ["png", "svg", "pdf", "tiff"] },
};

export type M8StatisticalFigureSpec<T extends M8StatisticalFigureType = M8StatisticalFigureType> = {
  kind: "statistical";
  chartType: T;
  title: string;
  xLabel: string;
  yLabel: string;
  caption: string;
  mapping: M8MappingByFigureType[T];
  publication: M8PublicationSettings;
  errorType?: "standard_deviation" | "standard_error" | "confidence_interval_95" | "custom_bounds";
  referenceLine?: number;
};

export type M8DiagramFigureSpec = {
  kind: "diagram";
  diagramType: M8DiagramType;
  title: string;
  caption: string;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
  renderer: "controlled_svg";
  publication: M8PublicationSettings;
};

export type M8FigureSpec = M8StatisticalFigureSpec | M8DiagramFigureSpec;

export type M8FigureExecutionRequest = {
  runId: string;
  code: string;
  data: M8DatasetRow[];
  requiredColumns: string[];
  timeoutSeconds: number;
  formats: Array<"png" | "svg" | "pdf" | "tiff">;
};

export type M8FigureExecutionResult = {
  status: "succeeded" | "failed" | "timed_out";
  runnerId: string;
  runnerVersion: string;
  pythonVersion: string;
  dependencies: Record<string, string>;
  stdout: string;
  stderr: string;
  errorType: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  outputs: Array<{ format: "png" | "svg" | "pdf" | "tiff"; base64: string; width: number; height: number; dpi: number }>;
};

export const M8_RUNTIME_LIMITS = { maxCodeCharacters: 32_000, maxRows: 10_000, minTimeoutSeconds: 5, maxTimeoutSeconds: 60, maxOutputBytes: 12 * 1024 * 1024 } as const;

export function inferM8Columns(rows: M8DatasetRow[]): M8ColumnSchema[] {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return names.map((name) => {
    const values = rows.map((row) => row[name]).filter((value) => value !== null && value !== "");
    const types = new Set(values.map(inferValueType));
    return { name, type: types.size === 1 ? [...types][0] : "mixed", nullable: values.length !== rows.length, uniqueCount: new Set(values.map(String)).size };
  });
}
export function requiredM8MappingFields(type: M8StatisticalFigureType): string[] {
  const fields: Partial<Record<M8StatisticalFigureType, string[]>> = {
    histogram: ["value"], density: ["value"], boxplot: ["category", "value"], violin: ["category", "value"],
    bar: ["category", "value"], point: ["category", "value"], errorbar: ["category", "estimate"], forest: ["label", "estimate", "lowerCI", "upperCI"],
    scatter: ["x", "y"], bubble: ["x", "y", "size"], regression: ["x", "y"], line: ["x", "y"], area: ["x", "y"], heatmap: ["x", "y", "value"],
    correlation_heatmap: ["variables"], facet: ["x", "y"], multi_panel: ["panelSpecs"],
  };
  return fields[type] ?? [];
}

export function validateM8StatisticalSpec(spec: M8StatisticalFigureSpec, columns: M8ColumnSchema[]): string[] {
  const errors: string[] = [];
  if (!spec.title.trim()) errors.push("图件标题不能为空。");
  const columnNames = new Set(columns.map((column) => column.name));
  const mapping = spec.mapping as Record<string, unknown>;
  for (const field of requiredM8MappingFields(spec.chartType)) {
    const value = mapping[field];
    if (field === "variables") {
      if (!Array.isArray(value) || value.length < 2) errors.push("相关矩阵至少需要两个数值字段。");
      else for (const column of value) if (typeof column !== "string" || !columnNames.has(column)) errors.push(`相关矩阵指向不存在的数据列：${String(column)}。`);
    } else if (field === "panelSpecs") {
      if (!Array.isArray(value) || value.length < 2) errors.push("多面板图至少需要两个面板规格。");
    } else if (typeof value !== "string" || !value.trim()) errors.push(`当前图型缺少字段映射：${field}。`);
    else if (!columnNames.has(value)) errors.push(`字段映射 ${field} 指向不存在的数据列：${value}。`);
  }
  for (const field of numericMappingFields(spec.chartType)) {
    const mapped = mapping[field];
    if (typeof mapped === "string") {
      const column = columns.find((item) => item.name === mapped);
      if (column && column.type !== "number") errors.push(`${field} 需要数值列，当前 ${mapped} 被识别为 ${column.type}。`);
    }
  }
  return errors;
}

export function recommendM8FigureTypes(columns: M8ColumnSchema[]): M8StatisticalFigureType[] {
  const numeric = columns.filter((column) => column.type === "number");
  const categorical = columns.filter((column) => column.type === "string" || column.type === "boolean");
  const dates = columns.filter((column) => column.type === "date");
  const names = new Set(columns.map((column) => column.name.toLowerCase()));
  if (["estimate", "lower_ci", "upper_ci"].every((name) => names.has(name))) return ["forest", "errorbar"];
  if (dates.length && numeric.length) return ["line", "area"];
  if (numeric.length >= 2) return ["scatter", "regression"];
  if (categorical.length >= 2 && numeric.length) return ["heatmap", "bar"];
  if (categorical.length && numeric.length) return ["boxplot", "violin", "bar"];
  if (numeric.length === 1) return ["histogram", "density"];
  return [];
}

function inferValueType(value: M8DatasetValue): M8ColumnSchema["type"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/u.test(value) && !Number.isNaN(Date.parse(value))) return "date";
  return "string";
}

function numericMappingFields(type: M8StatisticalFigureType): string[] {
  const fields: Partial<Record<M8StatisticalFigureType, string[]>> = {
    histogram: ["value"], density: ["value"], boxplot: ["value"], violin: ["value"], bar: ["value"], point: ["value"],
    errorbar: ["estimate", "error", "lower", "upper"], forest: ["estimate", "lowerCI", "upperCI"], scatter: ["x", "y"], bubble: ["x", "y", "size"],
    regression: ["x", "y"], line: ["y"], area: ["y"], heatmap: ["value"], facet: ["y"],
  };
  return fields[type] ?? [];
}
