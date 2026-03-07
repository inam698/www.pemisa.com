/**
 * 2FA Disable API Route
 * POST: Disable 2FA — requires re-authentication with password
 */

import { NextRequest, NextResponse } from "next/server";
import { comparePassword } from "@/lib/auth";
import { verifyFirebaseIdToken } from "@/middleware/authMiddleware";
import prisma from "@/lib/db/prisma";
import { logApiError, logInfo, logSecurityEvent } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const payload = await verifyFirebaseIdToken(token);
    if (!payload) return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });

    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required to disable 2FA" },
        { status: 400 }
      );
    }

    // Verify the user's password
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
      logSecurityEvent("Failed 2FA disable attempt - invalid password", payload.userId, ip);
      return NextResponse.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        totpSecret: null,
        backupCodes: null,
        twoFactorEnabled: false,
      },
    });

    logInfo("2FA disabled", { userId: payload.userId });

    return NextResponse.json({ success: true, message: "2FA disabled" });
  } catch (error) {
    logApiError("/api/auth/2fa/disable", error as Error);
    return NextResponse.json({ success: false, error: "Failed to disable 2FA" }, { status: 500 });
  }
}
