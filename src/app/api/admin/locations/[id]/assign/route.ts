/**
 * POST /api/admin/locations/[id]/assign
 * Assign or unassign a machine to/from this location.
 * Body: { machineId: string, assign: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { assignMachineToLocation } from "@/services/locationService";
import { JwtPayload } from "@/types";
import { z } from "zod";

const assignSchema = z.object({
  machineId: z.string().min(1, "Machine ID required"),
  assign: z.boolean(),
});

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    // URL: /api/admin/locations/[id]/assign → segments[-2] = id
    const segments = request.nextUrl.pathname.split("/");
    const locationId = segments[segments.length - 2];

    const body = await request.json();
    const validation = assignSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { machineId, assign } = validation.data;
    await assignMachineToLocation(machineId, assign ? locationId : null);

    return NextResponse.json({
      success: true,
      message: assign ? "Machine assigned to location" : "Machine unassigned from location",
    });
  } catch (error) {
    console.error("Assign machine error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to assign machine" },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(postHandler);
