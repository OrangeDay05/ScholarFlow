import { M8_DIAGRAM_TYPES, M8_PUBLICATION_PRESETS, type M8DiagramFigureSpec } from "@/app/lib/m8-figure-contracts";
import { runM8Diagram } from "@/db/repositories/m8-diagrams";
import { M8FigureError } from "@/db/repositories/m8-figures";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body)) return apiError(400, "INVALID_INPUT", "概念图请求格式无效。");
  const specification = parseDiagram(body.specification);
  if (!specification) return apiError(400, "INVALID_INPUT", "概念图规格无效。");
  try { return apiSuccess(await runM8Diagram(auth.actor, (await params).projectId, { figureProjectId: text(body.figure_project_id), specification }), 201); }
  catch (error) { if (error instanceof M8FigureError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message); return apiError(500, "DIAGRAM_OPERATION_FAILED", "概念图生成失败。"); }
}

function parseDiagram(value: unknown): M8DiagramFigureSpec | null {
  if (!isRecord(value) || value.kind !== "diagram" || typeof value.diagramType !== "string" || !M8_DIAGRAM_TYPES.includes(value.diagramType as (typeof M8_DIAGRAM_TYPES)[number]) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  const nodes = value.nodes.flatMap((node) => isRecord(node) && text(node.id) && text(node.label) ? [{ id: text(node.id)!, label: text(node.label)! }] : []);
  const edges = value.edges.flatMap((edge) => isRecord(edge) && text(edge.source) && text(edge.target) ? [{ source: text(edge.source)!, target: text(edge.target)!, label: text(edge.label) }] : []);
  if (nodes.length !== value.nodes.length || edges.length !== value.edges.length) return null;
  return { kind: "diagram", diagramType: value.diagramType as M8DiagramFigureSpec["diagramType"], title: text(value.title) ?? "科研概念图", caption: text(value.caption) ?? "", nodes, edges, renderer: "controlled_svg", publication: M8_PUBLICATION_PRESETS.paper_double_column };
}

function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
