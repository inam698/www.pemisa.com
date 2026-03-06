/**
 * POST /api/voucher/redeem
 * Redeems a verified voucher. Marks it as USED.
 * 
 * Supports TWO authentication modes:
 * 1. Dashboard (JWT) - station attendants/admins redeem via web UI
 * 2. Device (API key) - ESP32 dispensers confirm dispensing via X-API-Key header
 * 
 * Rate-limited to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/middleware/authMiddleware";
import { authenticateDevice } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { voucherRedeemSchema, deviceVoucherRedeemSchema } from "@/lib/validators";
import { redeemVoucher, redeemVoucherFromDevice } from "@/services/voucherService";
import { recordSale } from "@/services/salesService";

async function redeemHandler(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Device Auth Path (ESP32 dispenser) ──────────────────────
    if (body.device_id && (request.headers.get("x-api-key") || body.api_key)) {
      const device = await authenticateDevice(request, body);
      if (!device) {
        return NextResponse.json(
          { success: false, error: "Device authentication failed" },
          { status: 401 }
        );
      }

      const validation = deviceVoucherRedeemSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: validation.error.errors[0].message },
          { status: 400 }
        );
      }

      const { voucher_code, device_id, litres_dispensed } = validation.data;

      const updatedVoucher = await redeemVoucherFromDevice(
        voucher_code,
        device_id,
        litres_dispensed
      );

      // Also record as a sale transaction
      await recordSale({
        machineId: device.machineId,
        deviceId: device.deviceId,
        stationId: device.stationId,
        litres: litres_dispensed,
        amount: updatedVoucher.amount,
        paymentType: "VOUCHER",
        voucherCode: voucher_code,
        phone: updatedVoucher.phone,
      });

      return NextResponse.json({
        success: true,
        message: "Voucher redeemed successfully",
        litres_dispensed,
      });
    }

    // ── Dashboard Auth Path (JWT) ───────────────────────────────
    const user = authenticateRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Validate input
    const validation = voucherRedeemSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.errors[0].message,
        },
        { status: 400 }
      );
    }

    const { voucherId, stationId } = validation.data;

    // Ensure station users can only redeem for their own station
    if (user.role === "STATION" && user.stationId !== stationId) {
      return NextResponse.json(
        { success: false, error: "Cannot redeem for a different station" },
        { status: 403 }
      );
    }

    // Redeem the voucher (atomic transaction)
    const updatedVoucher = await redeemVoucher(voucherId, stationId);

    return NextResponse.json({
      success: true,
      data: {
        message: "Voucher redeemed successfully",
        voucher: {
          id: updatedVoucher.id,
          name: updatedVoucher.name,
          amount: updatedVoucher.amount,
          voucherCode: updatedVoucher.voucherCode,
          status: updatedVoucher.status,
          stationName: updatedVoucher.station?.stationName || "Unknown",
          redeemedAt: updatedVoucher.redeemedAt?.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Voucher redeem error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to redeem voucher";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// Rate limit: 20 redemptions per 15 minutes per IP
export const POST = withRateLimit(redeemHandler, 20, 15 * 60 * 1000, "voucher-redeem");
