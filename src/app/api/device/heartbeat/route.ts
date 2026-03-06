/**
 * POST /api/device/heartbeat
 * Device monitoring heartbeat endpoint.
 * Receives telemetry from IoT dispensers including oil_level,
 * temperature, pump_cycles, and last_voucher.
 * Requires device authentication via X-API-Key header.
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

    // Record telemetry snapshot if device sent extra data
    if (data.rssi != null || data.free_heap != null || data.temperature != null) {
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
    console.error("Device heartbeat error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process heartbeat" },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  withDeviceAuth(heartbeatHandler),
  200,
  15 * 60 * 1000,
  "device-heartbeat"
);
