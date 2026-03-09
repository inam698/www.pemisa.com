/**
 * Admin Pricing Rules API
 * GET  /api/admin/pricing - List all pricing rules
 * POST /api/admin/pricing - Create a pricing rule
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { pricingRuleCreateSchema } from "@/lib/validators";
import { createPricingRule, getAllPricingRules } from "@/services/pricingService";
import { JwtPayload } from "@/types";

// ─── GET: List Pricing Rules ────────────────────────────────────

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const result = await getAllPricingRules({ page, pageSize, activeOnly });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("List pricing rules error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pricing rules" },
      { status: 500 }
    );
  }
}

// ─── POST: Create Pricing Rule ──────────────────────────────────

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const validation = pricingRuleCreateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const rule = await createPricingRule(validation.data);

    return NextResponse.json(
      { success: true, data: rule, message: "Pricing rule created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create pricing rule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create pricing rule" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const POST = withAdmin(postHandler);
