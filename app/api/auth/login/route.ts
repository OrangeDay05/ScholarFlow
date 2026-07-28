import { authErrorResponse, loginUser, sessionCookie } from "@/app/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await loginUser(
      request,
      typeof body.identifier === "string" ? body.identifier : "",
      typeof body.password === "string" ? body.password : "",
    );
    return Response.json(
      { ok: true, data: { user: result.user } },
      { headers: { "set-cookie": sessionCookie(result.sessionToken) } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
