/**
 * GET /api/admin/beneficiaries — Lookup beneficiary by phone
 * POST /api/admin/beneficiaries — Resend SMS for a voucher
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { lookupBeneficiary, resendVoucherSms } from "@/services/beneficiaryService";
import { logAudit } from "@/services/auditService";
import { JwtPayload } from "@/types";

async function lookupHandler(request: NextRequest, _user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }
    const vouchers = await lookupBeneficiary(phone);
    return NextResponse.json({ success: true, data: vouchers });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to lookup beneficiary" },
      { status: 500 }
    );
  }
}

async function resendSmsHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { voucherId } = await request.json();
    if (!voucherId) {
      return NextResponse.json(
        { success: false, error: "voucherId is required" },
        { status: 400 }
      );
    }

    const result = await resendVoucherSms(voucherId);

    await logAudit({
      action: "RESEND_SMS",
      actor: user.email,
      actorRole: user.role,
      target: `voucher:${voucherId}`,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resend SMS" },
      { status: 400 }
    );
  }
}

export const GET = withAdmin(lookupHandler);
export const POST = withAdmin(resendSmsHandler);
