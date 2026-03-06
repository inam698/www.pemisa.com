/**
 * GET /api/admin/batches — List voucher batches
 * POST /api/admin/batches — Revoke a batch (pass batchId in body)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getBatches, revokeBatch } from "@/services/batchService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function batchesHandler(request: NextRequest, _user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getBatches({
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "20"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch batches" },
      { status: 500 }
    );
  }
}

async function revokeBatchHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { batchId } = await request.json();
    if (!batchId) {
      return NextResponse.json(
        { success: false, error: "batchId is required" },
        { status: 400 }
      );
    }

    const result = await revokeBatch(batchId);

    await logAudit({
      action: "REVOKE_BATCH",
      actor: user.email,
      actorRole: user.role,
      target: `batch:${batchId}`,
      details: { revokedCount: result.revokedCount },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to revoke batch" },
      { status: 400 }
    );
  }
}

export const GET = withAdmin(batchesHandler);
export const POST = withAdmin(revokeBatchHandler);
