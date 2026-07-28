import { authActor, resolveRequestSession, type AuthActor } from "./auth";

export type M3Actor = AuthActor;

export async function getM3Actor(request: Request): Promise<M3Actor | null> {
  const session = await resolveRequestSession(request);
  return session.status === "valid" && session.user
    ? authActor(session.user)
    : null;
}
