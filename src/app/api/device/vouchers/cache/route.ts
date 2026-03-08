/**
 * GET /api/device/vouchers/cache
 * Returns all active (UNUSED, non-expired) vouchers in a compact format
 * for ESP32 devices to cache locally for offline verification.
 *
 * Authentication: X-API-Key + X-Device-ID headers (same as heartbeat).
 * Response is kept minimal to fit ESP32 memory constraints.
 *
 * Each voucher entry: { c: code, p: phoneHash, l: litres, a: amount, e: expiryTs, n: name }
 * - phoneHash: last 9 digits of normalized phone (what the device collects)
 * - expiryTs: Unix timestamp in seconds
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { authenticateDevice } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";

async function cacheHandler(request: NextRequest) {
  // Authenticate device using headers (GET request — no body)
  const deviceId = request.headers.get("x-device-id") || "";
  const apiKey = request.headers.get("x-api-key") || "";

  if (!deviceId || !apiKey) {
    return NextResponse.json(
      { success: false, error: "Missing device credentials" },
      { status: 401 }
    );
  }

  // Build a fake body for authenticateDevice (it expects body.device_id)
  const authBody = { device_id: deviceId, api_key: apiKey };
  const device = await authenticateDevice(request, authBody);

  if (!device) {
    return NextResponse.json(
      { success: false, error: "Device authentication failed" },
      { status: 401 }
    );
  }

  try {
    // Fetch all active vouchers (UNUSED and not expired)
    const vouchers = await prisma.voucher.findMany({
      where: {
        status: "UNUSED",
        expiryDate: { gt: new Date() },
      },
      select: {
        voucherCode: true,
        phone: true,
        litres: true,
        amount: true,
        expiryDate: true,
        name: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500, // Cap at 500 to prevent excessive payload
    });

    // Compact format for ESP32 (minimize bandwidth + memory)
    const compact = vouchers.map((v) => ({
      c: v.voucherCode,
      p: v.phone.replace(/\D/g, "").slice(-9),  // Last 9 digits
      l: Math.round(v.litres * 1000) / 1000,     // 3 decimal places
      a: Math.round(v.amount * 100) / 100,
      e: Math.floor(v.expiryDate.getTime() / 1000), // Unix seconds
      n: v.name.substring(0, 20),                 // Truncate name for LCD
    }));

    return NextResponse.json({
      success: true,
      count: compact.length,
      ts: Math.floor(Date.now() / 1000),
      vouchers: compact,
    });
  } catch (error) {
    console.error("Voucher cache error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch voucher cache" },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(
  cacheHandler,
  20,               // 20 requests per window
  15 * 60 * 1000,   // 15 minutes
  "device-voucher-cache"
);
