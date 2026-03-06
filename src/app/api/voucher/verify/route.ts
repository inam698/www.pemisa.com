/**
 * POST /api/voucher/verify
 * Verifies a voucher by phone number and code.
 * 
 * Supports TWO authentication modes:
 * 1. Dashboard (JWT) - station attendants/admins verify via web UI
 * 2. Device (API key) - ESP32 dispensers verify via X-API-Key header
 * 
 * Rate-limited to prevent brute-force attacks.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/middleware/authMiddleware";
import { authenticateDevice } from "@/middleware/deviceAuthMiddleware";
import { withVoucherRateLimit } from "@/middleware/rateLimiter";
import { voucherVerifySchema, deviceVoucherVerifySchema } from "@/lib/validators";
import { verifyVoucher, verifyVoucherForDevice } from "@/services/voucherService";
import { normalizePhoneNumber } from "@/lib/utils";

async function verifyHandler(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Device Auth Path (ESP32 dispenser) ──────────────────────
    if (body.device_id && (request.headers.get("x-api-key") || body.api_key)) {
      const device = await authenticateDevice(request, body);
      if (!device) {
        return NextResponse.json(
          { status: "rejected", litres: 0, amount: 0, message: "Device authentication failed" },
          { status: 401 }
        );
      }

      const validation = deviceVoucherVerifySchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { status: "rejected", litres: 0, amount: 0, message: validation.error.errors[0].message },
          { status: 400 }
        );
      }

      const { phone, voucher_code, device_id } = validation.data;
      const normalizedPhone = normalizePhoneNumber(phone);
      const result = await verifyVoucherForDevice(normalizedPhone, voucher_code, device_id);

      return NextResponse.json(result);
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
    const validation = voucherVerifySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.errors[0].message,
        },
        { status: 400 }
      );
    }

    const { phone, voucherCode } = validation.data;

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Verify voucher
    const result = await verifyVoucher(normalizedPhone, voucherCode);

    return NextResponse.json({
      success: result.valid,
      data: result,
    });
  } catch (error) {
    console.error("Voucher verify error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify voucher" },
      { status: 500 }
    );
  }
}

// Apply strict rate limiting to prevent brute-force
export const POST = withVoucherRateLimit(verifyHandler);
