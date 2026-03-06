/**
 * 2FA Verification API Route
 * POST: Verify TOTP token during login
 * Requires a temporary 2FA token from the login endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { verify2FAToken } from "@/lib/2fa";
import { generateToken } from "@/lib/auth";
import { logApiError, logSecurityEvent } from "@/lib/logger";
import { withRateLimit } from "@/lib/rateLimit";
import jwt from "jsonwebtoken";
import type { UserRole } from "@/types";

const TWO_FA_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";

const verifyHandler = async (request: Request): Promise<Response> => {
  try {
    const body = await (request as NextRequest).json();
    const { twoFaToken, token: totpCode, useBackupCode } = body;

    if (!twoFaToken || !totpCode) {
      return NextResponse.json(
        { success: false, error: "Missing twoFaToken or verification code" },
        { status: 400 }
      );
    }

    // Verify the temporary 2FA token from login
    let twoFaPayload: { userId: string; purpose: string };
    try {
      twoFaPayload = jwt.verify(twoFaToken, TWO_FA_SECRET) as { userId: string; purpose: string };
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid or expired 2FA session. Please log in again." },
        { status: 401 }
      );
    }

    if (twoFaPayload.purpose !== "2fa-verify") {
      return NextResponse.json(
        { success: false, error: "Invalid token purpose" },
        { status: 401 }
      );
    }

    const userId = twoFaPayload.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { station: true },
    });

    if (!user || !user.totpSecret) {
      return NextResponse.json(
        { success: false, error: "2FA not enabled for this user" },
        { status: 400 }
      );
    }

    let isValid = false;

    if (useBackupCode) {
      // Check backup codes
      const codes: string[] = JSON.parse(user.backupCodes || "[]");
      const codeIndex = codes.indexOf(totpCode);
      if (codeIndex > -1) {
        isValid = true;
        // Remove used backup code
        codes.splice(codeIndex, 1);
        await prisma.user.update({
          where: { id: userId },
          data: { backupCodes: JSON.stringify(codes) },
        });
      }
    } else {
      // Verify TOTP token
      isValid = verify2FAToken(user.totpSecret, totpCode);
    }

    if (!isValid) {
      const ip =
        (request as NextRequest).headers.get("x-forwarded-for") ||
        (request as NextRequest).headers.get("x-real-ip") ||
        "unknown";
      logSecurityEvent("2FA verification failed", userId, ip, { useBackupCode });
      return NextResponse.json(
        { success: false, error: "Invalid 2FA code" },
        { status: 401 }
      );
    }

    // Generate full JWT token now that 2FA is verified
    const jwtToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      stationId: user.stationId,
    });

    return NextResponse.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          stationId: user.stationId,
          stationName: user.station?.stationName || null,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      },
    });
  } catch (error) {
    logApiError("/api/auth/2fa/verify", error as Error);
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
};

// Rate limit: 5 attempts per 5 minutes per IP
export const POST = withRateLimit(verifyHandler, { maxRequests: 5, windowMs: 5 * 60 * 1000 });
