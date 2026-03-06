/**
 * Admin Sales API
 * GET /api/admin/sales - List sales with pagination and filters
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getSales, getSalesAnalytics } from "@/services/salesService";
import { JwtPayload } from "@/types";

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const deviceId = searchParams.get("deviceId") || undefined;
    const paymentType = searchParams.get("paymentType") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const result = await getSales({ page, pageSize, deviceId, paymentType, startDate, endDate });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("List sales error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
