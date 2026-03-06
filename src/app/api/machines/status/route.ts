/**
 * GET /api/machines/status
 * Returns the status of all registered dispenser machines.
 * Used by both admin dashboard and external monitoring.
 * Requires admin JWT authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getAllMachineStatuses } from "@/services/machineService";

async function statusHandler(request: NextRequest) {
  try {
    const machines = await getAllMachineStatuses();

    return NextResponse.json({
      success: true,
      data: machines,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Machine status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch machine statuses" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(statusHandler);
