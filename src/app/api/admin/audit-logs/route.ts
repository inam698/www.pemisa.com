/**
 * GET /api/admin/audit-logs — Paginated audit log listing
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getAuditLogs } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function auditLogsHandler(request: NextRequest, _user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getAuditLogs({
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "50"),
      action: searchParams.get("action") || undefined,
      actor: searchParams.get("actor") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(auditLogsHandler);
