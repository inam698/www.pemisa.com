/**
 * GET /api/device/pricing?device_id=DISP-XXXX
 * Device-facing endpoint: returns the current effective price for a machine.
 * Used by ESP32 firmware to get dynamic pricing.
 * Requires device authentication via X-API-Key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { getCurrentPrice } from "@/services/pricingService";
import { DeviceAuthPayload } from "@/types";

async function pricingHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const result = await getCurrentPrice(device.machineId);

    return NextResponse.json({
      success: true,
      device_id: device.deviceId,
      price_per_litre: result.pricePerLitre,
      source: result.source,
    });
  } catch (error) {
    console.error("Device pricing error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}

export const GET = withDeviceAuth(pricingHandler);
