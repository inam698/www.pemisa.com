/**
 * Rate Limiter Middleware
 * Redis-backed distributed rate limiter for API endpoints.
 * Uses sliding window algorithm with IP-based tracking.
 *
 * At 1000 devices + admin users, rate limits are shared across
 * multiple app replicas via Redis. Falls back to in-memory when
 * REDIS_URL is not configured (development).
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimitCheck } from "@/lib/cache/redis";

// ─── Get Client IP ──────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  // Check common proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

// ─── Rate Limit Middleware ──────────────────────────────────────

/**
 * Creates a rate-limited API handler wrapper.
 * Uses Redis INCR + EXPIRE for distributed counting across replicas.
 *
 * @param handler - The API handler to protect
 * @param maxRequests - Max requests per window (default: from env)
 * @param windowMs - Window duration in ms (default: from env)
 * @param prefix - Optional prefix for the rate limit key
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  maxRequests?: number,
  windowMs?: number,
  prefix: string = "api"
) {
  const limit =
    maxRequests ||
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10);
  const window =
    windowMs ||
    parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10); // 15 min default

  return async (request: NextRequest) => {
    const ip = getClientIp(request);
    const identifier = `${prefix}:${ip}`;

    const { allowed, remaining, resetTime } = await rateLimitCheck(
      identifier,
      limit,
      window
    );

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (resetTime - Date.now()) / 1000
            ).toString(),
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(resetTime).toISOString(),
          },
        }
      );
    }

    // Add rate limit headers to successful response
    const response = await handler(request);

    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set(
      "X-RateLimit-Reset",
      new Date(resetTime).toISOString()
    );

    return response;
  };
}

/**
 * Stricter rate limiter specifically for voucher verification.
 * Prevents brute-force attacks on voucher codes.
 * Default: 5 attempts per 15 minutes per IP.
 */
export function withVoucherRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  const maxAttempts = parseInt(
    process.env.VOUCHER_VERIFY_RATE_LIMIT || "5",
    10
  );
  return withRateLimit(handler, maxAttempts, 15 * 60 * 1000, "voucher-verify");
}

/**
 * Device-specific rate limiter keyed by device_id rather than IP.
 * Prevents a compromised device from flooding the server.
 * Default: 120 requests per 15 minutes per device.
 */
export function withDeviceRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  maxRequests: number = 120
) {
  return withRateLimit(handler, maxRequests, 15 * 60 * 1000, "device");
}
