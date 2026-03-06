/**
 * POST /api/sales/report
 * Records a cash sale transaction from an IoT dispenser machine.
 * Requires device authentication via X-API-Key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { deviceSalesReportSchema } from "@/lib/validators";
import { recordSale } from "@/services/salesService";
import { recordTransaction } from "@/services/transactionService";
import { DeviceAuthPayload } from "@/types";

async function salesReportHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const validation = deviceSalesReportSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { litres, amount, payment_type, voucher_code, phone } = validation.data;

    const sale = await recordSale({
      machineId: device.machineId,
      deviceId: device.deviceId,
      stationId: device.stationId,
      litres,
      amount,
      paymentType: payment_type,
      voucherCode: voucher_code,
      phone,
    });

    // Also log in the unified transaction table
    await recordTransaction({
      machineId: device.machineId,
      deviceId: device.deviceId,
      type: payment_type === "voucher" ? "voucher" : "purchase",
      voucherCode: voucher_code,
      oilMl: litres * 1000,
      amountPaid: amount,
    });

    return NextResponse.json({
      success: true,
      sale_id: sale.id,
      message: "Sale recorded successfully",
    });
  } catch (error) {
    console.error("Sales report error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record sale" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  withDeviceAuth(salesReportHandler),
  100,
  15 * 60 * 1000,
  "sales-report"
);
