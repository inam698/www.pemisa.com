/**
 * GET /api/admin/users — List users
 * POST /api/admin/users — Create user
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getUsers, createUser } from "@/services/userService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function getUsersHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getUsers({
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "50"),
      role: searchParams.get("role") || undefined,
      search: searchParams.get("search") || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 }
    );
  }
}

async function createUserHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const { name, email, password, role, stationId } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { success: false, error: "Name, email, password, and role are required" },
        { status: 400 }
      );
    }

    const newUser = await createUser({ name, email, password, role, stationId });

    await logAudit({
      action: "CREATE_USER",
      actor: user.email,
      actorRole: user.role,
      target: `user:${email}`,
      details: { role, stationId },
    });

    return NextResponse.json({ success: true, data: newUser }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 400 }
    );
  }
}

export const GET = withAdmin(getUsersHandler);
export const POST = withAdmin(createUserHandler);
