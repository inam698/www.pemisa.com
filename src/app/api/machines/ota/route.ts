/**
 * POST /api/machines/ota/check
 * Device checks whether a firmware update is available.
 * Returns download URL + SHA-256 checksum for integrity verification.
 *
 * POST /api/machines/ota/push  (admin only — see admin routes)
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { otaCheckSchema } from "@/lib/validators";
import { checkOtaUpdate } from "@/services/machineService";
import { DeviceAuthPayload } from "@/types";

async function otaCheckHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const validation = otaCheckSchema.safeParse(body);
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
      return NextResponse.json({
        update_available: false,
      });
    }

    return NextResponse.json({
      update_available: true,
      version: update.version,
      url: update.url,
      checksum: update.checksum,
      release_notes: update.releaseNotes,
    });
  } catch (error) {
    console.error("OTA check error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check OTA update" },
      { status: 500 }
    );
  }
}

// 10 OTA checks per 15 min per device (infrequent)
export const POST = withRateLimit(
  withDeviceAuth(otaCheckHandler),
  10,
  15 * 60 * 1000,
  "ota-check"
);
