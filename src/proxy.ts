import { NextRequest, NextResponse } from "next/server";
import { isPlayEdition, isThreeDPath } from "@/lib/edition";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/full-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    const response = NextResponse.redirect(destination);
    response.cookies.set("wn_edition", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (request.nextUrl.pathname === "/play-app") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    const response = NextResponse.redirect(destination);
    response.cookies.set("wn_edition", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (!isPlayEdition()) return NextResponse.next();

  if (isThreeDPath(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not available in this edition" }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    request.nextUrl.pathname === "/api/v1/reports/export" &&
    request.nextUrl.searchParams.get("type") === "three_d"
  ) {
    return NextResponse.json({ ok: false, error: "Not available in this edition" }, { status: 404 });
  }

  const response = NextResponse.next();
  response.headers.set("X-Wallet-Edition", "play");
  return response;
}

export const config = {
  matcher: [
    "/full-app",
    "/play-app",
    "/three-d/:path*",
    "/api/v1/three-d/:path*",
    "/api/internal/three-d-sync",
    "/api/v1/reports/export",
    "/api/:path*",
  ],
};
