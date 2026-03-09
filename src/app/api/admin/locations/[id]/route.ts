/**
 * Admin Location Detail API
 * GET    /api/admin/locations/[id] - Get location details with machines
 * PATCH  /api/admin/locations/[id] - Update location
 * DELETE /api/admin/locations/[id] - Delete location
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { locationUpdateSchema } from "@/lib/validators";
import {
  getLocationById,
  updateLocation,
  deleteLocation,
} from "@/services/locationService";
import { JwtPayload } from "@/types";

function extractId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split("/");
  return segments[segments.length - 1];
}

// ─── GET: Location Detail ───────────────────────────────────────

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = extractId(request);
    const location = await getLocationById(id);
    if (!location) {
      return NextResponse.json(
        { success: false, error: "Location not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: location });
  } catch (error) {
    console.error("Get location error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch location" },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update Location ─────────────────────────────────────

async function patchHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = extractId(request);
    const body = await request.json();
    const validation = locationUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const location = await updateLocation(id, validation.data);
    return NextResponse.json({ success: true, data: location });
  } catch (error) {
    console.error("Update location error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update location" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete Location ────────────────────────────────────

async function deleteHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = extractId(request);
    await deleteLocation(id);
    return NextResponse.json({ success: true, message: "Location deleted" });
  } catch (error) {
    console.error("Delete location error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete location" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const PATCH = withAdmin(patchHandler);
export const DELETE = withAdmin(deleteHandler);
