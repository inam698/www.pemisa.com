/**
 * 2FA Setup API Route
 * GET: Get setup QR code
 * POST: Verify and enable 2FA
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/middleware/authMiddleware";
import prisma from "@/lib/db/prisma";
import { generate2FASecret, generateBackupCodes, verify2FAToken } from "@/lib/2fa";
import { logApiError, logInfo } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const payload = await verifyFirebaseIdToken(token);
    if (!payload) return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const { secret, qrCodeDataUrl } = await generate2FASecret(user.email);
    const backupCodes = generateBackupCodes(10);

    logInfo("2FA setup requested", { userId: user.id, email: user.email });

    return NextResponse.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        secret,
        backupCodes,
      },
    });
  } catch (error) {
    logApiError("/api/auth/2fa/setup", error as Error, undefined);
    return NextResponse.json({ success: false, error: "Setup failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const payload = await verifyFirebaseIdToken(token);
    if (!payload) return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });

    const body = await request.json();
    const { secret, token: verificationToken } = body;

    if (!secret || !verificationToken) {
      return NextResponse.json({ success: false, error: "Missing secret or token" }, { status: 400 });
    }

    // Verify the TOTP token against the secret
    const isValid = verify2FAToken(secret, verificationToken);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid verification code" }, { status: 400 });
    }

    // Generate backup codes server-side (never trust client-supplied codes)
    const serverBackupCodes = generateBackupCodes(10);

    // Save to user
    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        totpSecret: secret,
        backupCodes: JSON.stringify(serverBackupCodes),
        twoFactorEnabled: true,
      },
    });

    logInfo("2FA enabled successfully", { userId: payload.userId });

    return NextResponse.json({
      success: true,
      message: "2FA enabled successfully",
      data: { backupCodes: serverBackupCodes },
    });
  } catch (error) {
    logApiError("/api/auth/2fa/setup", error as Error, undefined);
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
