import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// /benchmark is the only page meant to be public - everything else (the
// operational dashboard) is gated. /sign-in and Auth.js's own routes must
// stay reachable while signed out, or nobody could ever sign in.
const PUBLIC_PATHS = ["/benchmark", "/sign-in"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/api/auth");

  if (isPublic || req.auth) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
