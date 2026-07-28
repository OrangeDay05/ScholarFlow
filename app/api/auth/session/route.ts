import { resolveRequestSession } from "@/app/lib/auth";

export async function GET(request: Request) {
  const session = await resolveRequestSession(request);
  if (session.status !== "valid" || !session.user) {
    const expired = session.status === "expired";
    return Response.json(
      {
        ok: false,
        error: {
          code: expired ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
          message: expired ? "登录状态已过期，请重新登录。" : "请先登录。",
        },
      },
      { status: 401 },
    );
  }
  return Response.json({ ok: true, data: { user: session.user } });
}
