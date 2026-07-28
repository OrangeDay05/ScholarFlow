import {
  authErrorResponse,
  registerUser,
  sessionCookie,
} from "@/app/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await registerUser(request, {
      displayName: string(body.display_name),
      email: string(body.email),
      phone: string(body.phone),
      password: string(body.password),
      confirmPassword: string(body.confirm_password),
    });
    return Response.json(
      { ok: true, data: { user: result.user } },
      { status: 201, headers: { "set-cookie": sessionCookie(result.sessionToken) } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
