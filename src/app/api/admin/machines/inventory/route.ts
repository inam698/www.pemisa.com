/**
 * GET  /api/admin/machines/inventory - Get all machine inventory levels
 * POST /api/admin/machines/inventory - Refill a machine tank
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { getMachineInventory, refillTank } from "@/services/transactionService";
import { machineRefillSchema } from "@/lib/validators";
import { JwtPayload } from "@/types";

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const inventory = await getMachineInventory();
    return NextResponse.json({ success: true, data: inventory });
  } catch (error) {
    console.error("Inventory fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();
    const machineId = body.machineId;
    if (!machineId) {
      return NextResponse.json(
        { success: false, error: "machineId is required" },
        { status: 400 }
      );
    }

    const validation = machineRefillSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const result = await refillTank(machineId, validation.data.litres);

    return NextResponse.json({
      success: true,
      data: result,
      message: `Added ${result.litresAdded.toFixed(1)}L to ${result.name}`,
    });
  } catch (error) {
    console.error("Refill error:", error);
    const message = error instanceof Error ? error.message : "Failed to refill tank";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const POST = withAdmin(postHandler);
