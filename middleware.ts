import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "theres-no-chance.com";

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const hostname = host.split(":")[0];
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isProduction || !hostname || isLocalHost(hostname) || hostname === CANONICAL_HOST) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = CANONICAL_HOST;

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
