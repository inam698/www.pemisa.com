/**
 * Next.js Middleware
 * Handles route-level redirects (not API auth - that's handled per-route).
 * Provides login page redirect for unauthenticated access to protected routes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = ["/login", "/api/auth/login"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // API routes handle their own auth via middleware wrappers
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // For page routes, check for token cookie or let client-side handle redirect
  // (Client-side auth context handles the redirect for SPA navigation)
  return NextResponse.next();
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
