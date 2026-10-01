"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  COOKIE_NAME,
  attemptKey,
  clearAttempts,
  cooldownSeconds,
  cookieOptions,
  credentialsOk,
  makeSession,
  parseUsers,
  recordFailure,
  sessionKey,
} from "../../auth";

/** Caller IP as Vercel reports it. Unknown callers share one bucket. */
async function callerIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export async function login(formData: FormData) {
  const user = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const key = attemptKey(user, await callerIp());

  // Already paused: do not even check the password, so a paused caller learns
  // nothing from how long the response takes.
  const waiting = cooldownSeconds(key);
  if (waiting > 0) {
    redirect(`/login?wait=${Math.ceil(waiting / 60)}`);
  }

  const raw = process.env.BASIC_AUTH_USERS;
  const users = parseUsers(raw);
  if (!(await credentialsOk(user, password, users))) {
    const pause = recordFailure(key);
    redirect(pause > 0 ? `/login?wait=${Math.ceil(pause / 60)}` : "/login?error=1");
  }

  clearAttempts(key);
  const token = await makeSession(user, await sessionKey(raw));
  (await cookies()).set(COOKIE_NAME, token, cookieOptions());
  redirect("/");
}
