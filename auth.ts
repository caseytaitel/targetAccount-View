/**
 * Per-person login. BASIC_AUTH_USERS is username:password pairs separated by
 * semicolons (newlines also work). Passwords may contain colons and commas, not
 * semicolons. Missing config fails closed.
 *
 * After a good login we set an httpOnly cookie. The password is never stored
 * in the cookie. Changing BASIC_AUTH_USERS invalidates existing sessions.
 */

export const COOKIE_NAME = "ta_session";
export const SESSION_DAYS = 7;

const DUMMY_PASSWORD = "not-a-real-password";

/* -------------------------------------------------------------------------
 * Failed-login cooldown
 *
 * Ten failures from the same person within fifteen minutes pauses that
 * username+IP pair for fifteen minutes, then clears itself. Nobody has to
 * unlock anyone.
 *
 * Deliberately a cooldown and not a lockout: the key includes the *caller's*
 * IP, so someone spraying a teammate's username from their own machine pauses
 * only themselves, never the teammate. A permanent per-username lockout would hand any
 * stranger a way to lock the team out of the app.
 *
 * Honest limit: this counter lives in the memory of one serverless instance,
 * so a cold start resets it and a distributed attacker gets more attempts than
 * the numbers below suggest. It turns "unlimited guesses" into "rate-limited
 * guesses", which is all it is for. Long random passwords remain the actual
 * protection.
 * ------------------------------------------------------------------------- */

export const MAX_ATTEMPTS = 10;
export const WINDOW_MS = 15 * 60 * 1000;
export const COOLDOWN_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 5000; // bounded so a spray cannot grow memory without limit

type Attempt = { count: number; windowStart: number; pausedUntil: number };

const attempts = new Map<string, Attempt>();

/** One bucket per username + caller IP. */
export function attemptKey(user: string, ip: string): string {
  return `${user.trim().toLowerCase()}|${ip}`;
}

/** Drop entries whose window and cooldown have both lapsed. */
function sweep(now: number): void {
  for (const [key, a] of attempts) {
    if (now > a.pausedUntil && now - a.windowStart > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

/** Seconds still to wait for this key, or 0 when it may try now. */
export function cooldownSeconds(key: string, now: number = Date.now()): number {
  const a = attempts.get(key);
  if (!a || now >= a.pausedUntil) {
    return 0;
  }
  return Math.ceil((a.pausedUntil - now) / 1000);
}

/** Record one failed attempt. Returns the seconds to wait, 0 if still allowed. */
export function recordFailure(key: string, now: number = Date.now()): number {
  const existing = attempts.get(key);
  const stale = !existing || now - existing.windowStart > WINDOW_MS;
  const a: Attempt = stale
    ? { count: 0, windowStart: now, pausedUntil: 0 }
    : existing;

  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.pausedUntil = now + COOLDOWN_MS;
    a.count = 0;
    a.windowStart = now;
  }

  if (!attempts.has(key)) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      sweep(now);
    }
    if (attempts.size >= MAX_TRACKED_KEYS) {
      return cooldownSeconds(key, now); // full of live entries: do not grow
    }
  }
  attempts.set(key, a);
  return cooldownSeconds(key, now);
}

/** A good password clears the record, so one bad morning costs nothing later. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/** Test seam only. */
export function _resetAttempts(): void {
  attempts.clear();
}

export function parseUsers(raw: string | undefined): Map<string, string> {
  const users = new Map<string, string>();
  if (!raw) {
    return users;
  }
  for (const line of raw.split(/[;\r\n]+/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const splitAt = trimmed.indexOf(":");
    if (splitAt <= 0) {
      continue;
    }
    const user = trimmed.slice(0, splitAt).trim();
    const password = trimmed.slice(splitAt + 1);
    if (!user || !password) {
      continue;
    }
    users.set(user, password);
  }
  return users;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  const raw = new ArrayBuffer(key.byteLength);
  new Uint8Array(raw).set(key);
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function passwordsMatch(given: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

export async function credentialsOk(user: string, password: string, users: Map<string, string>): Promise<boolean> {
  if (users.size === 0) {
    return false;
  }
  const expected = users.get(user) ?? DUMMY_PASSWORD;
  const knownUser = users.has(user);
  const okPassword = await passwordsMatch(password, expected);
  return knownUser && okPassword;
}

export async function sessionKey(rawUsers: string | undefined): Promise<Uint8Array> {
  return sha256(rawUsers ?? "");
}

function encodePayload(payload: string): string {
  const bytes = new TextEncoder().encode(payload);
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodePayload(token: string): string | null {
  try {
    const pad = (4 - (token.length % 4)) % 4;
    const padded = token.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function makeSession(user: string, key: Uint8Array): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `v1|${user}|${exp}`;
  const mac = await hmacHex(key, payload);
  return `${encodePayload(payload)}.${mac}`;
}

export async function readSession(
  token: string | undefined,
  key: Uint8Array,
  users: Map<string, string>,
): Promise<string | null> {
  if (!token) {
    return null;
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const payload = decodePayload(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!payload || !mac) {
    return null;
  }
  const expected = await hmacHex(key, payload);
  if (!hexEqual(mac, expected)) {
    return null;
  }
  const parts = payload.split("|");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }
  const user = parts[1];
  const exp = Number(parts[2]);
  if (!user || !Number.isFinite(exp) || exp < Date.now() / 1000) {
    return null;
  }
  if (!users.has(user)) {
    return null;
  }
  return user;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  };
}
