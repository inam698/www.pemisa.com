/**
 * PUT /api/admin/users/[id] — Update user
 * DELETE /api/admin/users/[id] — Delete user
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { updateUser, deleteUser, resetUserPassword } from "@/services/userService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function updateUserHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    const body = await request.json();

    // Check if this is a password reset
    if (body.newPassword) {
      await resetUserPassword(id, body.newPassword);
      await logAudit({
        action: "RESET_PASSWORD",
        actor: user.email,
        actorRole: user.role,
        target: `user:${id}`,
      });
      return NextResponse.json({ success: true, message: "Password reset successfully" });
    }

    const { name, email, role, stationId } = body;
    const updated = await updateUser(id, { name, email, role, stationId });

    await logAudit({
      action: "UPDATE_USER",
      actor: user.email,
      actorRole: user.role,
      target: `user:${email || id}`,
      details: { name, role, stationId },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 400 }
    );
  }
}

async function deleteUserHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;

    if (id === user.userId) {
      return NextResponse.json(
        { success: false, error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    await deleteUser(id);

    await logAudit({
      action: "DELETE_USER",
      actor: user.email,
      actorRole: user.role,
      target: `user:${id}`,
    });

    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 400 }
    );
  }
}

export const PUT = withAdmin(updateUserHandler);
export const DELETE = withAdmin(deleteUserHandler);
