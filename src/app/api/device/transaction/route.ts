/**
 * POST /api/device/transaction
 * Logs a unified transaction from ESP32 after dispensing oil.
 * Supports both voucher and purchase transaction types.
 * Decrements machine oil inventory atomically.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { deviceTransactionLogSchema } from "@/lib/validators";
import { recordTransaction } from "@/services/transactionService";
import { DeviceAuthPayload } from "@/types";

async function transactionLogHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const validation = deviceTransactionLogSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const {
      transaction_type,
      voucher_code,
      oil_ml_dispensed,
      payment_amount,
    } = validation.data;

    const transaction = await recordTransaction({
      machineId: device.machineId,
      deviceId: device.deviceId,
      type: transaction_type,
      voucherCode: voucher_code,
      oilMl: oil_ml_dispensed,
      amountPaid: payment_amount,
    });

    return NextResponse.json({
      success: true,
      transaction_id: transaction.id,
      oil_remaining_after: transaction.oilRemainingAfter,
      message: "Transaction logged successfully",
    });
  } catch (error) {
    console.error("Transaction log error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log transaction" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  withDeviceAuth(transactionLogHandler),
  200,
  15 * 60 * 1000,
  "device-transaction"
);
