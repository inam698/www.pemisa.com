/**
 * Rate Limiting Middleware
 * Prevents API abuse with in-memory rate limiting
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
};

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...defaultConfig, ...config };

  return (identifier: string): { allowed: boolean; retryAfter?: number } => {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || record.resetTime < now) {
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true };
    }

    if (record.count < maxRequests) {
      record.count++;
      return { allowed: true };
    }

    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  };
}

// Get client IP from request
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "unknown";
}

// Middleware helper for API routes
export function withRateLimit(
  handler: (req: Request) => Promise<Response>,
  config?: Partial<RateLimitConfig>
) {
  const limiter = rateLimit(config);

  return async (req: Request) => {
    const url = new URL(req.url);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const identifier = `${ip}:${url.pathname}`;

    const result = limiter(identifier);

    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter || 60),
            "X-RateLimit-Limit": String(config?.maxRequests || defaultConfig.maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    return handler(req);
  };
}
