/**
 * Next.js Middleware
 * Handles:
 * - Request body size limits (DoS protection)
 * - CSRF protection for state-changing API requests
 * - Route-level redirects for unauthenticated users
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Max request body size: 10MB (prevents memory exhaustion DoS)
const MAX_BODY_SIZE = 10 * 1024 * 1024;

// Routes exempt from CSRF checks (public or device-to-server)
const CSRF_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/device/",
  "/api/voucher/verify",
  "/api/voucher/redeem",
  "/api/machines/ota",
  "/api/health",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ─── Request Body Size Limit ────────────────────────────────
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return NextResponse.json(
      { success: false, error: "Request body too large. Maximum size is 10MB." },
      { status: 413 }
    );
  }

  // ─── CSRF Protection ───────────────────────────────────────
  // Enforce Origin/Referer check on state-changing methods for browser requests
  const method = request.method;
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isApiRoute = pathname.startsWith("/api/");

  if (isStateChanging && isApiRoute) {
    const isExempt = CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    const hasApiKey = request.headers.has("x-api-key");

    // Skip CSRF check for device requests (they use API keys, not cookies)
    if (!isExempt && !hasApiKey) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json(
              { success: false, error: "CSRF validation failed" },
              { status: 403 }
            );
          }
        } catch {
          return NextResponse.json(
            { success: false, error: "Invalid origin header" },
            { status: 403 }
          );
        }
      }
    }
  }

  // ─── Public Routes ─────────────────────────────────────────
  const publicPaths = ["/login", "/api/auth/login", "/api/health"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    return response;
  }

  // API routes handle their own auth via middleware wrappers
  if (pathname.startsWith("/api/")) {
    return response;
  }

  // For page routes, let client-side auth context handle redirect
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
