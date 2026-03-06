/**
 * Admin Machine Detail API
 * GET /api/admin/machines/[id] - Get machine details
 * PUT /api/admin/machines/[id] - Update machine
 * DELETE /api/admin/machines/[id] - Delete machine
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { machineUpdateSchema } from "@/lib/validators";
import {
  getMachineById,
  updateMachine,
  deleteMachine,
  regenerateApiKey,
} from "@/services/machineService";
import { JwtPayload } from "@/types";

// ─── GET: Machine Details ───────────────────────────────────────

async function getHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    const machine = await getMachineById(id);

    return NextResponse.json({ success: true, data: machine });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Machine not found";
    return NextResponse.json(
      { success: false, error: message },
      { status: 404 }
    );
  }
}

// ─── PUT: Update Machine ────────────────────────────────────────

async function putHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    const body = await request.json();

    // Handle special action: regenerate API key
    if (body.action === "regenerate_api_key") {
      const newKey = await regenerateApiKey(id);
      return NextResponse.json({
        success: true,
        data: { apiKey: newKey }, // plaintext returned once
        message: "API key regenerated. Update the device firmware with the new key.",
      });
    }

    const validation = machineUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const machine = await updateMachine(id, validation.data);

    return NextResponse.json({
      success: true,
      data: machine,
      message: "Machine updated successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update machine";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove Machine ─────────────────────────────────────

async function deleteHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    await deleteMachine(id);

    return NextResponse.json({
      success: true,
      message: "Machine deleted successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete machine";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const PUT = withAdmin(putHandler);
export const DELETE = withAdmin(deleteHandler);
