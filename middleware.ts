import { NextRequest, NextResponse } from "next/server";

import { COOKIE_NAME, parseUsers, readSession, sessionKey } from "./auth";

const PUBLIC = new Set(["/login", "/logout"]);

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.has(path) || path.startsWith("/_next") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  const raw = process.env.BASIC_AUTH_USERS;
  const users = parseUsers(raw);
  const user = await readSession(request.cookies.get(COOKIE_NAME)?.value, await sessionKey(raw), users);
  if (!user) {
    // API callers get a status they can act on, not a login page.
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Signed out. Reload to sign in." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
