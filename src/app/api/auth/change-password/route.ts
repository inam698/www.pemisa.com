/**
 * POST /api/auth/change-password — Change own password
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/middleware/authMiddleware";
import { changePassword } from "@/services/userService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function changePasswordHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Current and new passwords are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await changePassword(user.userId, currentPassword, newPassword);

    await logAudit({
      action: "CHANGE_PASSWORD",
      actor: user.email,
      actorRole: user.role,
      target: `user:${user.email}`,
    });

    return NextResponse.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to change password" },
      { status: 400 }
    );
  }
}

export const POST = withAuth(changePasswordHandler);
