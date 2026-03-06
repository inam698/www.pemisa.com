/**
 * POST /api/machines/heartbeat
 * Receives heartbeat ping from IoT dispenser machines.
 * Updates machine status, last_seen, telemetry fields.
 * Returns server config + OTA update instructions if available.
 * Requires device authentication via X-API-Key header.
 *
 * Scalability: at 1000 devices × 1 heartbeat/60s = ~17/s.
 * Device auth is Redis-cached; DB write is a single UPDATE.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDeviceAuth } from "@/middleware/deviceAuthMiddleware";
import { withRateLimit } from "@/middleware/rateLimiter";
import { deviceHeartbeatSchema } from "@/lib/validators";
import { processHeartbeat, HeartbeatData, recordTelemetry } from "@/services/machineService";
import { DeviceAuthPayload } from "@/types";
import { publishHeartbeatEvent } from "@/lib/monitoring/events";

async function heartbeatHandler(
  request: NextRequest,
  device: DeviceAuthPayload,
  body: Record<string, unknown>
) {
  try {
    const validation = deviceHeartbeatSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Build telemetry payload
    const telemetry: HeartbeatData = {
      uptimeSeconds: data.uptime_seconds,
      rssi: data.rssi,
      freeHeap: data.free_heap,
      ipAddress: data.ip_address,
      oilLevel: data.oil_level,
      temperature: data.temperature,
      pumpCycles: data.pump_cycles,
      lastVoucher: data.last_voucher,
    };

    // Process heartbeat + get config response
    const config = await processHeartbeat(
      device.deviceId,
      data.firmware_version,
      telemetry
    );

    // Optionally record telemetry snapshot (only if device sent extra data)
    if (data.rssi != null || data.free_heap != null || data.temperature != null) {
      // Fire-and-forget — don't block the heartbeat response
      recordTelemetry({
        machineId: device.machineId,
        deviceId: device.deviceId,
        rssi: data.rssi,
        uptimeSeconds: data.uptime_seconds,
        freeHeap: data.free_heap,
        temperature: data.temperature,
        pumpCycles: data.pump_cycles,
      }).catch((err) => console.error("Telemetry write failed:", err));
    }

    // Publish real-time event for SSE dashboard clients
    publishHeartbeatEvent({
      deviceId: device.deviceId,
      status: "ONLINE",
      oilLevel: data.oil_level ?? null,
      temperature: data.temperature ?? null,
      pumpCycles: data.pump_cycles ?? null,
      lastVoucher: data.last_voucher ?? null,
      lastSeen: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      server_time: new Date().toISOString(),
      config_version: config.configVersion,
      price_per_litre: config.pricePerLitre,
      heartbeat_interval: config.heartbeatInterval,
      ...(config.otaUpdate && { ota_update: config.otaUpdate }),
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process heartbeat" },
      { status: 500 }
    );
  }
}

// Allow frequent heartbeats: 200 per 15 minutes per IP
export const POST = withRateLimit(
  withDeviceAuth(heartbeatHandler),
  200,
  15 * 60 * 1000,
  "heartbeat"
);
