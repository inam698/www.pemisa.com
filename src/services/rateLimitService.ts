/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting API requests per IP
 */

const requestCounts: Record<string, { count: number; resetTime: number }> = {};
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // Max requests per window

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwaredFor = request.headers.get("x-forwarded-for");
  if (forwaredFor) {
    return forwaredFor.split(",")[0].trim();
  }
  return "unknown";
}

/**
 * Check if request is rate limited
 */
export function isRateLimited(ip: string, limit: number = MAX_REQUESTS): boolean {
  const now = Date.now();
  const record = requestCounts[ip];

  if (!record || now > record.resetTime) {
    // Reset window
    requestCounts[ip] = {
      count: 1,
      resetTime: now + WINDOW_MS,
    };
    return false;
  }

  record.count++;
  return record.count > limit;
}

/**
 * Get remaining requests for IP
 */
export function getRemainingRequests(ip: string, limit: number = MAX_REQUESTS): number {
  const record = requestCounts[ip];
  if (!record || Date.now() > record.resetTime) {
    return limit;
  }
  return Math.max(0, limit - record.count);
}

/**
 * Specific rate limits for different endpoints
 */
export const RATE_LIMITS = {
  LOGIN: 5, // 5 attempts per 15 minutes
  AUTH: 10, // General auth endpoints
  API: 100, // General API endpoints
  UPLOAD: 10, // File uploads
  EXPORT: 20, // Report exports
};

/**
 * Handle rate limit response
 */
export function createRateLimitResponse(retryAfter: number = 900) {
  return {
    status: 429,
    body: JSON.stringify({
      success: false,
      error: "Too many requests. Please try again later.",
      retryAfter,
    }),
    headers: {
      "Retry-After": String(retryAfter),
      "Content-Type": "application/json",
    },
  };
}

/**
 * Cleanup old records periodically (call this every hour)
 */
export function cleanupRateLimitRecords(): void {
  const now = Date.now();
  Object.keys(requestCounts).forEach((ip) => {
    if (now > requestCounts[ip].resetTime) {
      delete requestCounts[ip];
    }
  });
}

// Clean up every hour
setInterval(cleanupRateLimitRecords, 60 * 60 * 1000);
