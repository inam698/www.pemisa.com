/**
 * Admin Locations API
 * GET /api/admin/locations - List locations (fleet management)
 * POST /api/admin/locations - Create a new location
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { locationCreateSchema } from "@/lib/validators";
import { getLocations, createLocation, getFleetOverview } from "@/services/locationService";
import { JwtPayload } from "@/types";

// ─── GET: List Locations or Fleet Overview ──────────────────────

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);

    // If ?overview=true, return fleet-level stats
    if (searchParams.get("overview") === "true") {
      const overview = await getFleetOverview();
      return NextResponse.json({ success: true, data: overview });
    }

    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const search = searchParams.get("search") || undefined;

    const result = await getLocations({ page, pageSize, search });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("List locations error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

// ─── POST: Create Location ──────────────────────────────────────

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const validation = locationCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const location = await createLocation(validation.data);

    return NextResponse.json(
      { success: true, data: location, message: "Location created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create location error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create location" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const POST = withAdmin(postHandler);
