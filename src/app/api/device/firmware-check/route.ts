/**
 * POST /api/device/firmware-check
 * Device-facing firmware update check endpoint (alias for /api/machines/ota).
 * ESP32 devices can call this to check for OTA updates.
 * Requires device authentication via X-API-Key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { deviceFirmwareCheckSchema } from "@/lib/validators";
import { checkOtaUpdate } from "@/services/machineService";
import { DeviceAuthPayload } from "@/types";

async function firmwareCheckHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const validation = deviceFirmwareCheckSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const update = await checkOtaUpdate(
      device.deviceId,
      validation.data.current_version
    );

    if (!update) {
      return NextResponse.json({ update_available: false });
    }

    return NextResponse.json({
      update_available: true,
      version: update.version,
      url: update.url,
      checksum: update.checksum,
      release_notes: update.releaseNotes,
    });
  } catch (error) {
    console.error("Firmware check error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check firmware update" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  withDeviceAuth(firmwareCheckHandler),
  10,
  15 * 60 * 1000,
  "device-firmware-check"
);
