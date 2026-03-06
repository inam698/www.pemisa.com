/**
 * Admin Machines API
 * GET /api/admin/machines - List machines with pagination
 * POST /api/admin/machines - Register a new machine
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { machineCreateSchema } from "@/lib/validators";
import { getMachines, createMachine } from "@/services/machineService";
import { JwtPayload } from "@/types";

// ─── GET: List Machines ─────────────────────────────────────────

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const stationId = searchParams.get("stationId") || undefined;

    const result = await getMachines({ page, pageSize, search, status, stationId });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("List machines error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machines" },
      { status: 500 }
    );
  }
}

// ─── POST: Create Machine ───────────────────────────────────────

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const validation = machineCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const machine = await createMachine(validation.data);

    return NextResponse.json(
      {
        success: true,
        data: machine,
        message: `Machine registered. Device ID: ${machine.deviceId}. SAVE THE API KEY — it will not be shown again.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create machine error:", error);
    const message = error instanceof Error ? error.message : "Failed to create machine";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const POST = withAdmin(postHandler);
