import { clearSessionCookie, revokeRequestSession } from "@/app/lib/auth";

export async function POST(request: Request) {
  await revokeRequestSession(request);
  return Response.json(
    { ok: true, data: { logged_out: true } },
    { headers: { "set-cookie": clearSessionCookie() } },
  );
}
