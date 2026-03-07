/**
 * POST /api/auth/login
 * Authenticates admin and station users.
 * If 2FA is enabled, returns a temporary 2FA token requiring verification.
 * Otherwise returns JWT token and user info on success.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { generateToken, comparePassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { withRateLimit } from "@/lib/rateLimit";
import { logSecurityEvent, logApiError } from "@/lib/logger";
import type { UserRole } from "@/types";
import jwt from "jsonwebtoken";

function getTwoFaSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "fallback-secret-change-me") {
    throw new Error("CRITICAL: JWT_SECRET environment variable is not set.");
  }
  return secret;
}

const loginHandler = async (request: Request): Promise<Response> => {
  try {
    const body = await request.json();

    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.errors[0].message,
        },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: { station: true },
    });

    if (!user) {
      // Use generic message to prevent user enumeration
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
      logSecurityEvent("Failed login attempt - user not found", undefined, ip, { email });
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
      logSecurityEvent("Failed login attempt - invalid password", user.id, ip, { email });
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // If 2FA is enabled, return a temporary token requiring 2FA verification
    if (user.twoFactorEnabled && user.totpSecret) {
      const twoFaToken = jwt.sign(
        { userId: user.id, purpose: "2fa-verify" },
        getTwoFaSecret(),
        { expiresIn: "5m" }
      );

      return NextResponse.json({
        success: true,
        data: {
          requiresTwoFactor: true,
          twoFaToken,
          userId: user.id,
        },
      });
    }

    // No 2FA — generate full JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      stationId: user.stationId,
      organizationId: user.organizationId,
    });

    // Return token and user info
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          stationId: user.stationId,
          stationName: user.station?.stationName || null,
          organizationId: user.organizationId,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      },
    });
  } catch (error) {
    logApiError("/api/auth/login", error as Error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
};

// Rate limit: 10 login attempts per 15 minutes per IP
export const POST = withRateLimit(loginHandler, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
