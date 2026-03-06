/**
 * GET /api/admin/charts — Dashboard chart data
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getChartData } from "@/services/exportService";
import { JwtPayload } from "@/types";

async function chartsHandler(_request: NextRequest, _user: JwtPayload) {
  try {
    const data = await getChartData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(chartsHandler);
