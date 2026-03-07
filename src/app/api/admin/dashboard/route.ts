/**
 * GET /api/admin/dashboard
 * Returns aggregated dashboard metrics for the admin portal.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getDashboardMetrics } from "@/services/voucherService";
import { JwtPayload } from "@/types";

async function dashboardHandler(
  _request: NextRequest,
  _user: JwtPayload
) {
  try {
    const metrics = await getDashboardMetrics();

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard metrics" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(dashboardHandler);
