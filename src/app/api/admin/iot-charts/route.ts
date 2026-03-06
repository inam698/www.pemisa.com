/**
 * Admin IoT Charts API
 * GET /api/admin/iot-charts - Returns IoT analytics data for dashboard charts
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getSalesAnalytics, getDailySales, getSalesByMachine } from "@/services/salesService";
import { getMachineStatusOverview } from "@/services/machineService";
import { JwtPayload } from "@/types";

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const [analytics, dailySales, machineLeaderboard, machineOverview] = await Promise.all([
      getSalesAnalytics(),
      getDailySales(30),
      getSalesByMachine(),
      getMachineStatusOverview(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        analytics,
        dailySales,
        machineLeaderboard,
        machineOverview,
      },
    });
  } catch (error) {
    console.error("IoT charts error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch IoT analytics" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
