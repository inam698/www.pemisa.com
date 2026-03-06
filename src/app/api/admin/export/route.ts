/**
 * GET /api/admin/export — Export data as CSV
 * Query params: type=vouchers|stations|audit&status=&batchId=&from=&to=
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { exportVouchersCsv, exportStationsCsv, exportAuditLogsCsv } from "@/services/exportService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function exportHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "vouchers";
    const status = searchParams.get("status") || undefined;
    const batchId = searchParams.get("batchId") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    let csv: string;
    let filename: string;

    switch (type) {
      case "stations":
        csv = await exportStationsCsv();
        filename = `stations-report-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      case "audit":
        csv = await exportAuditLogsCsv({ from, to });
        filename = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
        break;
      default:
        csv = await exportVouchersCsv({ status, batchId, from, to });
        filename = `vouchers-report-${new Date().toISOString().split("T")[0]}.csv`;
    }

    await logAudit({
      action: "EXPORT_REPORT",
      actor: user.email,
      actorRole: user.role,
      target: `export:${type}`,
      details: { status, batchId, from, to },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to export data" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(exportHandler);
