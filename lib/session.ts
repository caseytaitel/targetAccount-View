import { cookies } from "next/headers";

import { COOKIE_NAME, parseUsers, readSession, sessionKey } from "@/auth";

/** The signed-in username, or null. Middleware already gates every route; this is the per-request read. */
export async function currentUser(): Promise<string | null> {
  const raw = process.env.BASIC_AUTH_USERS;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return readSession(token, await sessionKey(raw), parseUsers(raw));
}

/**
 * Mutating routes accept JSON only. Combined with the sameSite=lax session cookie,
 * this means a cross-site form post can neither carry the cookie nor the content type.
 */
export function isJson(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}
