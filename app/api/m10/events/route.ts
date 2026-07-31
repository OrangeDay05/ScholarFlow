import { apiError, apiSuccess, isRecord } from "@/app/api/m3/_shared";
import { requireM10Actor } from "@/app/api/m10/_shared";
import { M10_EVENT_CATEGORIES, type M10OperationalEventInput } from "@/app/lib/m10-operations-contracts";
import { M10OperationsError, recordOperationalEvent, resolveOperationalControls } from "@/db/repositories/m10-operations";

export async function GET(request: Request) {
  const auth = await requireM10Actor(request);
  if ("response" in auth) return auth.response;
  return apiSuccess(await resolveOperationalControls(auth.actor));
}

export async function POST(request: Request) {
  const auth = await requireM10Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.category !== "string" || !M10_EVENT_CATEGORIES.includes(body.category as M10OperationalEventInput["category"]) || typeof body.event_name !== "string") return apiError(400, "INVALID_EVENT", "事件参数无效。");
  try {
    return apiSuccess(await recordOperationalEvent(auth.actor, {
      projectId: typeof body.project_id === "string" ? body.project_id : null,
      category: body.category as M10OperationalEventInput["category"],
      eventName: body.event_name,
      success: body.success !== false,
      durationMs: typeof body.duration_ms === "number" ? body.duration_ms : null,
      metadata: isRecord(body.metadata) ? body.metadata as M10OperationalEventInput["metadata"] : {},
    }), 201);
  } catch (error) {
    if (error instanceof M10OperationsError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message);
    return apiError(500, "EVENT_RECORD_FAILED", "事件记录失败。");
  }
}
