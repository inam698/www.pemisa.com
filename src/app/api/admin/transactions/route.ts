/**
 * GET /api/admin/transactions
 * Returns paginated unified transaction history for admin dashboard.
 * Supports filtering by machine, type, and date range.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getTransactions, getTransactionAnalytics } from "@/services/transactionService";
import { JwtPayload } from "@/types";

async function handler(request: NextRequest, user: JwtPayload) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const machineId = url.searchParams.get("machineId") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;

    const [transactions, analytics] = await Promise.all([
      getTransactions({ page, pageSize, machineId, type, startDate, endDate }),
      getTransactionAnalytics(),
    ]);

    return NextResponse.json({
      success: true,
      ...transactions,
      analytics,
    });
  } catch (error) {
    console.error("Transactions fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handler);
