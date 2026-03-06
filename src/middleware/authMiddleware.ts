/**
 * Authentication Middleware
 * Validates JWT tokens and enforces role-based access control.
 * Used by API routes to protect endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, extractTokenFromHeader } from "@/lib/auth";
import { JwtPayload, UserRole } from "@/types";

// ─── Response Helpers ───────────────────────────────────────────

function unauthorizedResponse(message: string = "Unauthorized") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

function forbiddenResponse(message: string = "Forbidden") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

// ─── Token Extraction & Verification ────────────────────────────

/**
 * Extracts and verifies the JWT from the request.
 * Checks Authorization header first, then cookies.
 */
export function authenticateRequest(
  request: NextRequest
): JwtPayload | null {
  // Try Authorization header
  const authHeader = request.headers.get("authorization");
  let token = extractTokenFromHeader(authHeader);

  // Fallback to cookie
  if (!token) {
    token = request.cookies.get("token")?.value || null;
  }

  if (!token) return null;

  return verifyToken(token);
}

// ─── Middleware Wrapper Functions ────────────────────────────────

/**
 * Wraps an API handler with authentication check.
 * Returns 401 if token is missing or invalid.
 */
export function withAuth(
  handler: (
    request: NextRequest,
    user: JwtPayload
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const user = authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    return handler(request, user);
  };
}

/**
 * Wraps an API handler with admin role requirement.
 * Returns 403 if user is not an admin.
 */
export function withAdmin(
  handler: (
    request: NextRequest,
    user: JwtPayload
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const user = authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    if (user.role !== UserRole.ADMIN) {
      return forbiddenResponse("Admin access required.");
    }

    return handler(request, user);
  };
}

/**
 * Wraps an API handler with station role requirement.
 * Returns 403 if user is not a station attendant.
 */
export function withStation(
  handler: (
    request: NextRequest,
    user: JwtPayload
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const user = authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    if (user.role !== UserRole.STATION && user.role !== UserRole.ADMIN) {
      return forbiddenResponse("Station access required.");
    }

    return handler(request, user);
  };
}
