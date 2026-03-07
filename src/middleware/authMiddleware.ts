/**
 * Authentication Middleware
 * Verifies Firebase ID tokens and enforces role-based access control.
 * Used by API routes to protect endpoints.
 *
 * Uses Firebase Admin SDK for server-side token verification.
 * Loads user role from Firestore (server-side) to prevent spoofing.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, getAdminFirestore } from "@/lib/firebase/admin";
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
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Verifies a raw Firebase ID token string and returns a JwtPayload.
 * Use this when you have a token string (e.g., from a query parameter).
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<JwtPayload | null> {
  const decoded = await verifyFirebaseToken(idToken);
  if (!decoded) return null;

  try {
    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return null;

    const profile = userDoc.data()!;
    if (profile.disabled) return null;

    return {
      userId: decoded.uid,
      email: decoded.email || profile.email || "",
      role: profile.role as UserRole,
      stationId: profile.stationId || null,
    };
  } catch (err) {
    console.error("Error verifying Firebase ID token:", err);
    return null;
  }
}

/**
 * Verifies the Firebase ID token from the request and loads user profile.
 * Returns a JwtPayload-compatible object or null if invalid.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<JwtPayload | null> {
  const idToken = extractBearerToken(request);
  if (!idToken) return null;

  // Verify token with Firebase Admin (checks signature, expiry, revocation)
  const decoded = await verifyFirebaseToken(idToken);
  if (!decoded) return null;

  // Load user profile from Firestore for authoritative role
  try {
    const db = getAdminFirestore();
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      // User authenticated in Firebase but has no profile — deny access
      return null;
    }

    const profile = userDoc.data()!;

    if (profile.disabled) {
      return null;
    }

    return {
      userId: decoded.uid,
      email: decoded.email || profile.email || "",
      role: profile.role as UserRole,
      stationId: profile.stationId || null,
    };
  } catch (err) {
    console.error("Error loading user profile in middleware:", err);
    return null;
  }
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
    const user = await authenticateRequest(request);

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
    const user = await authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse("Admin access required.");
    }

    return handler(request, user);
  };
}

/**
 * Wraps an API handler with super admin role requirement.
 * Returns 403 if user is not a super admin.
 */
export function withSuperAdmin(
  handler: (
    request: NextRequest,
    user: JwtPayload
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const user = await authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    if (user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse("Super admin access required.");
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
    const user = await authenticateRequest(request);

    if (!user) {
      return unauthorizedResponse("Authentication required. Please log in.");
    }

    if (user.role !== UserRole.STATION && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return forbiddenResponse("Station access required.");
    }

    return handler(request, user);
  };
}
