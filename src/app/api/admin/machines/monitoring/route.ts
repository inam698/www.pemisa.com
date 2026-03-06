/**
 * GET /api/admin/machines/monitoring
 * Returns all machines with monitoring data for the admin dashboard.
 * Includes oil levels, temperature, status, and active alerts.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import {
  getAllMachineStatuses,
  getMachineStatusOverview,
} from "@/services/machineService";
import { getActiveAlerts } from "@/services/monitoringService";
import { JwtPayload } from "@/types";

async function handler(request: NextRequest, user: JwtPayload) {
  try {
    const [machines, overview, alerts] = await Promise.all([
      getAllMachineStatuses(),
      getMachineStatusOverview(),
      getActiveAlerts(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        machines,
        overview,
        alerts,
      },
    });
  } catch (error) {
    console.error("Monitoring fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch monitoring data" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handler);
