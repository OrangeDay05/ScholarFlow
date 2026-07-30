import {
  M8_IMPLEMENTED_FIGURE_TYPES,
  type M8DatasetRow,
  type M8PublicationSettings,
  type M8StatisticalFigureSpec,
} from "@/app/lib/m8-figure-contracts";
import { listM8Figures, M8FigureError, runM8Figure } from "@/db/repositories/m8-figures";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  try { return apiSuccess(await listM8Figures(auth.actor, (await params).projectId)); }
  catch (error) { return handleError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || body.action !== "run") return apiError(400, "INVALID_ACTION", "当前只支持 run 图件操作。");
  const specification = parseSpecification(body.specification);
  const data = parseData(body.data);
  if (!specification || !data) return apiError(400, "INVALID_INPUT", "图件规格、字段映射或数据格式无效。");
  try {
    return apiSuccess(await runM8Figure(auth.actor, (await params).projectId, {
      figureProjectId: optionalText(body.figure_project_id),
      specification,
      data,
      code: optionalText(body.code),
      sourceType: body.source_type === "upload" || body.source_type === "project_material" ? body.source_type : "manual",
      originalFilename: optionalText(body.original_filename),
    }), 201);
  } catch (error) { return handleError(error); }
}

function parseSpecification(value: unknown): M8StatisticalFigureSpec | null {
  if (!isRecord(value) || value.kind !== "statistical" || typeof value.chartType !== "string" || !M8_IMPLEMENTED_FIGURE_TYPES.includes(value.chartType as (typeof M8_IMPLEMENTED_FIGURE_TYPES)[number]) || !isRecord(value.mapping)) return null;
  const publication = parsePublication(value.publication);
  if (!publication) return null;
  return {
    kind: "statistical",
    chartType: value.chartType as (typeof M8_IMPLEMENTED_FIGURE_TYPES)[number],
    title: optionalText(value.title) ?? "",
    xLabel: optionalText(value.xLabel) ?? "",
    yLabel: optionalText(value.yLabel) ?? "",
    caption: optionalText(value.caption) ?? "",
    mapping: value.mapping as never,
    publication,
  };
}

function parsePublication(value: unknown): M8PublicationSettings | null {
  if (!isRecord(value)) return null;
  const allowedFormats = new Set(["png", "svg", "pdf", "tiff"]);
  const formats = Array.isArray(value.outputFormats) && value.outputFormats.length >= 1 && value.outputFormats.length <= 4 && new Set(value.outputFormats).size === value.outputFormats.length && value.outputFormats.every((item) => typeof item === "string" && allowedFormats.has(item))
    ? value.outputFormats as M8PublicationSettings["outputFormats"]
    : null;
  if (!formats) return null;
  const numberKeys = ["width", "height", "dpi", "baseFontSize", "titleFontSize", "axisFontSize", "legendFontSize", "lineWidth", "markerSize"] as const;
  if (numberKeys.some((key) => !Number.isFinite(Number(value[key])))) return null;
  if (!["screen_preview", "paper_single_column", "paper_double_column"].includes(String(value.preset)) || !["default", "colorblind_safe", "grayscale", "high_contrast"].includes(String(value.colorPalette)) || !["transparent", "white", "paper"].includes(String(value.background)) || !["best", "top", "right", "bottom", "none"].includes(String(value.legendPosition))) return null;
  return {
    preset: value.preset as M8PublicationSettings["preset"], unit: "in", fontFamily: optionalText(value.fontFamily) ?? "sans-serif",
    width: Number(value.width), height: Number(value.height), dpi: Number(value.dpi), baseFontSize: Number(value.baseFontSize),
    titleFontSize: Number(value.titleFontSize), axisFontSize: Number(value.axisFontSize), legendFontSize: Number(value.legendFontSize),
    lineWidth: Number(value.lineWidth), markerSize: Number(value.markerSize), background: value.background as M8PublicationSettings["background"],
    colorPalette: value.colorPalette as M8PublicationSettings["colorPalette"], grayscaleCompatible: Boolean(value.grayscaleCompatible),
    colorblindSafe: Boolean(value.colorblindSafe), legendPosition: value.legendPosition as M8PublicationSettings["legendPosition"], outputFormats: formats,
  };
}

function parseData(value: unknown): M8DatasetRow[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10_000) return null;
  const rows: M8DatasetRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const row: M8DatasetRow = {};
    for (const [key, cell] of Object.entries(item)) {
      if (!key.trim() || !["string", "number", "boolean"].includes(typeof cell) && cell !== null) return null;
      row[key] = cell as M8DatasetRow[string];
    }
    rows.push(row);
  }
  return rows;
}

function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function handleError(error: unknown) {
  if (error instanceof M8FigureError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message);
  return apiError(500, "FIGURE_OPERATION_FAILED", "科研图件操作失败。");
}
