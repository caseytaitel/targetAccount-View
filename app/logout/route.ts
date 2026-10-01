import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  (await cookies()).delete(COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", request.url));
}
