/**
 * GET /api/admin/stations — List stations
 * POST /api/admin/stations — Create station
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getStations, createStation, getAllStations } from "@/services/stationService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function getStationsHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all");

    if (all === "true") {
      const stations = await getAllStations();
      return NextResponse.json({ success: true, data: stations });
    }

    const result = await getStations({
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "50"),
      search: searchParams.get("search") || undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch stations" },
      { status: 500 }
    );
  }
}

async function createStationHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const { stationName, location } = body;

    if (!stationName || !location) {
      return NextResponse.json(
        { success: false, error: "Station name and location are required" },
        { status: 400 }
      );
    }

    const station = await createStation({ stationName, location });

    await logAudit({
      action: "CREATE_STATION",
      actor: user.email,
      actorRole: user.role,
      target: `station:${stationName}`,
    });

    return NextResponse.json({ success: true, data: station }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create station" },
      { status: 400 }
    );
  }
}

export const GET = withAdmin(getStationsHandler);
export const POST = withAdmin(createStationHandler);
