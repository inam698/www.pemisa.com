/**
 * POST /api/auth/logout
 * Invalidates the current JWT token by adding it to the blacklist.
 */

import { NextResponse } from "next/server";
import { extractTokenFromHeader, blacklistToken, verifyToken } from "@/lib/auth";
import { logSecurityEvent } from "@/lib/logger";

export async function POST(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("authorization");
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: "No token provided" },
        { status: 400 }
      );
    }

    // Verify the token is valid before blacklisting
    const decoded = await verifyToken(token);
    if (decoded) {
      await blacklistToken(token);
      logSecurityEvent("User logged out", decoded.userId, "unknown", {
        email: decoded.email,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    // Clear the token cookie if set
    response.cookies.set("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}
