/**
 * Device Authentication Middleware
 * Validates API key authentication for IoT dispenser machines.
 * Used by device-facing API routes (/api/voucher/verify, /api/voucher/redeem, etc.)
 *
 * Scalability design (1000+ devices):
 * - Redis-cached device lookups (avoid DB hit on every heartbeat/request)
 * - bcrypt API key comparison (hashed storage, no plaintext in DB)
 * - Redis-backed brute-force protection (shared across app replicas)
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db/prisma";
import { DeviceAuthPayload } from "@/types";
import {
  getCachedDeviceAuth,
  cacheDeviceAuth,
  invalidateDeviceAuth,
  rateLimitCheck,
  CachedDeviceAuth,
} from "@/lib/cache/redis";

// ─── Response Helpers ───────────────────────────────────────────

function unauthorizedResponse(message: string = "Device authentication failed") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

// ─── Brute-Force Protection (Redis-backed) ─────────────────────

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

async function checkBruteForce(
  identifier: string
): Promise<{ blocked: boolean; retryAfterMs: number }> {
  const { allowed, resetTime } = await rateLimitCheck(
    `bruteforce:${identifier}`,
    MAX_FAILED_ATTEMPTS,
    LOCK_DURATION_MS
  );
  if (!allowed) {
    return { blocked: true, retryAfterMs: resetTime - Date.now() };
  }
  return { blocked: false, retryAfterMs: 0 };
}

// ─── Device Authentication ──────────────────────────────────────

/**
 * Authenticates a device using device_id from the request body
 * and X-API-Key header (or api_key in body).
 *
 * Flow (optimised for 1000 concurrent devices):
 * 1. Check Redis brute-force counter
 * 2. Look up device in Redis cache (hit rate ~99% for active devices)
 * 3. Cache miss → DB lookup → populate cache (5-min TTL)
 * 4. bcrypt.compare(plaintext, hash) for key verification
 */
export async function authenticateDevice(
  request: NextRequest,
  body: Record<string, unknown>
): Promise<DeviceAuthPayload | null> {
  const deviceId = (body.device_id as string) || "";
  const apiKey =
    request.headers.get("x-api-key") ||
    (body.api_key as string) ||
    "";

  if (!deviceId || !apiKey) return null;

  // Check brute-force lockout (Redis-backed)
  const { blocked, retryAfterMs } = await checkBruteForce(deviceId);
  if (blocked) {
    console.warn(`Device ${deviceId} locked out for ${Math.ceil(retryAfterMs / 1000)}s`);
    return null;
  }

  try {
    // 1. Try Redis cache first (avoids DB query on every heartbeat)
    let cached: CachedDeviceAuth | null = await getCachedDeviceAuth(deviceId);

    if (!cached) {
      // 2. Cache miss → query database
      const machine = await prisma.machine.findUnique({
        where: { deviceId },
        select: {
          id: true,
          deviceId: true,
          apiKeyHash: true,
          stationId: true,
          status: true,
          pricePerLitre: true,
        },
      });

      if (!machine) return null;

      // Populate cache for future requests
      cached = {
        deviceId: machine.deviceId,
        machineId: machine.id,
        stationId: machine.stationId,
        apiKeyHash: machine.apiKeyHash,
        status: machine.status,
        pricePerLitre: machine.pricePerLitre,
      };
      await cacheDeviceAuth(deviceId, cached);
    }

    // 3. Verify API key with bcrypt
    const keyMatch = await bcrypt.compare(apiKey, cached.apiKeyHash);
    if (!keyMatch) {
      return null;
    }

    // 4. Reject machines in MAINTENANCE mode
    if (cached.status === "MAINTENANCE") {
      return null;
    }

    return {
      deviceId: cached.deviceId,
      machineId: cached.machineId,
      stationId: cached.stationId,
    };
  } catch (error) {
    console.error("Device auth error:", error);
    return null;
  }
}

// ─── Middleware Wrapper ─────────────────────────────────────────

/**
 * Wraps an API handler with device authentication.
 * Parses body, authenticates the device, and passes the payload.
 */
export function withDeviceAuth(
  handler: (
    request: NextRequest,
    device: DeviceAuthPayload,
    body: Record<string, unknown>
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const device = await authenticateDevice(request, body);
    if (!device) {
      return unauthorizedResponse(
        "Device authentication failed. Check device_id and api_key."
      );
    }

    return handler(request, device, body);
  };
}
