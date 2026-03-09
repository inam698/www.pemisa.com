/**
 * Admin Pricing Rule Detail API
 * PATCH  /api/admin/pricing/[id] - Update a pricing rule
 * DELETE /api/admin/pricing/[id] - Delete a pricing rule
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { pricingRuleUpdateSchema } from "@/lib/validators";
import { updatePricingRule, deletePricingRule } from "@/services/pricingService";
import { JwtPayload } from "@/types";

function extractId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split("/");
  return segments[segments.length - 1];
}

// ─── PATCH: Update Pricing Rule ─────────────────────────────────

async function patchHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = extractId(request);
    const body = await request.json();
    const validation = pricingRuleUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const rule = await updatePricingRule(id, validation.data);
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error("Update pricing rule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update pricing rule" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete Pricing Rule ────────────────────────────────

async function deleteHandler(request: NextRequest, user: JwtPayload) {
  try {
    const id = extractId(request);
    await deletePricingRule(id);
    return NextResponse.json({ success: true, message: "Pricing rule deleted" });
  } catch (error) {
    console.error("Delete pricing rule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete pricing rule" },
      { status: 500 }
    );
  }
}

export const PATCH = withAdmin(patchHandler);
export const DELETE = withAdmin(deleteHandler);
