/**
 * PUT /api/admin/stations/[id] — Update station
 * DELETE /api/admin/stations/[id] — Delete station
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { updateStation, deleteStation } from "@/services/stationService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function updateStationHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    const body = await request.json();
    const { stationName, location } = body;

    const updated = await updateStation(id, { stationName, location });

    await logAudit({
      action: "UPDATE_STATION",
      actor: user.email,
      actorRole: user.role,
      target: `station:${updated.stationName}`,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update station" },
      { status: 400 }
    );
  }
}

async function deleteStationHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = request.nextUrl.pathname.split("/").pop()!;
    await deleteStation(id);

    await logAudit({
      action: "DELETE_STATION",
      actor: user.email,
      actorRole: user.role,
      target: `station:${id}`,
    });

    return NextResponse.json({ success: true, message: "Station deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete station" },
      { status: 400 }
    );
  }
}

export const PUT = withAdmin(updateStationHandler);
export const DELETE = withAdmin(deleteStationHandler);
