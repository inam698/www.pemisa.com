/**
 * Redis Client — Scalable Cache & Rate Limiting
 *
 * Used across the platform for:
 * 1. Device auth caching (avoid DB hit on every heartbeat/request)
 * 2. Distributed rate limiting (works across multiple app replicas)
 * 3. Machine status caching (real-time dashboard without DB polling)
 * 4. Brute-force protection (shared state across instances)
 *
 * At 1000 devices × 1 heartbeat/60s = ~17 ops/s — Redis handles millions/s.
 *
 * Falls back to in-memory Maps when REDIS_URL is not set (dev mode).
 */

// ─── Redis Connection ───────────────────────────────────────────
// Dynamic import to avoid build failures when ioredis is not available

// eslint-disable-next-line no-explicit-any
let Redis: any = null;
// eslint-disable-next-line no-explicit-any
let redis: any = null;
let isRedisAvailable = false;

// eslint-disable-next-line no-explicit-any
function getRedis(): any {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("[Redis] REDIS_URL not set — using in-memory fallback (not suitable for production)");
    return null;
  }

  if (!Redis) {
    try {
      // eslint-disable-next-line no-require-imports
      Redis = require("ioredis");
    } catch {
      console.warn("[Redis] ioredis not installed — using in-memory fallback");
      return null;
    }
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) return null; // Stop retrying after 10 attempts
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 5000,
    });

    redis.on("connect", () => {
      isRedisAvailable = true;
      console.log("[Redis] Connected");
    });

    redis.on("error", (err) => {
      isRedisAvailable = false;
      console.error("[Redis] Error:", err.message);
    });

    redis.on("close", () => {
      isRedisAvailable = false;
    });

    redis.connect().catch(() => {
      console.warn("[Redis] Failed to connect — falling back to in-memory");
    });

    return redis;
  } catch {
    console.warn("[Redis] Initialization failed — using in-memory fallback");
    return null;
  }
}

// ─── In-Memory Fallback ─────────────────────────────────────────

const memoryCache = new Map<string, { value: string; expiresAt: number }>();

// Cleanup expired entries every 60 seconds (only in long-lived processes)
if (typeof globalThis !== "undefined") {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt > 0 && entry.expiresAt < now) {
        memoryCache.delete(key);
      }
    }
  }, 60_000);
  // Allow process to exit without waiting for the timer
  if (cleanupInterval.unref) cleanupInterval.unref();
}

// ─── Cache Operations ───────────────────────────────────────────

/**
 * Get a cached value. Returns null if not found or expired.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (r && isRedisAvailable) {
    try {
      return await r.get(key);
    } catch {
      // Fall through to memory
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set a cached value with optional TTL in seconds.
 */
export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const r = getRedis();
  if (r && isRedisAvailable) {
    try {
      if (ttlSeconds) {
        await r.setex(key, ttlSeconds, value);
      } else {
        await r.set(key, value);
      }
      return;
    } catch {
      // Fall through to memory
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  });
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (r && isRedisAvailable) {
    try {
      await r.del(key);
    } catch {
      // Fall through
    }
  }
  memoryCache.delete(key);
}

/**
 * Get JSON object from cache.
 */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set JSON object in cache.
 */
export async function cacheSetJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
}

// ─── Distributed Rate Limiting ──────────────────────────────────

/**
 * Sliding window rate limiter backed by Redis.
 * Falls back to in-memory when Redis is unavailable.
 *
 * @returns { allowed, remaining, resetTime }
 */
export async function rateLimitCheck(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const r = getRedis();
  const windowSeconds = Math.ceil(windowMs / 1000);
  const key = `rl:${identifier}`;

  if (r && isRedisAvailable) {
    try {
      const multi = r.multi();
      multi.incr(key);
      multi.pttl(key);
      const results = await multi.exec();

      const count = (results?.[0]?.[1] as number) || 1;
      const pttl = (results?.[1]?.[1] as number) || -1;

      // Set expiry on first request in window
      if (pttl === -1 || count === 1) {
        await r.pexpire(key, windowMs);
      }

      const resetTime = Date.now() + (pttl > 0 ? pttl : windowMs);

      if (count > maxRequests) {
        return { allowed: false, remaining: 0, resetTime };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - count),
        resetTime,
      };
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = memoryCache.get(key);

  if (!entry || entry.expiresAt < now) {
    memoryCache.set(key, {
      value: "1",
      expiresAt: now + windowMs,
    });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  const count = parseInt(entry.value, 10) + 1;
  entry.value = count.toString();

  if (count > maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.expiresAt };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - count),
    resetTime: entry.expiresAt,
  };
}

// ─── Device Auth Cache ──────────────────────────────────────────

const DEVICE_AUTH_TTL = 300; // 5 minutes

export interface CachedDeviceAuth {
  deviceId: string;
  machineId: string;
  stationId: string | null;
  apiKeyHash: string;
  status: string;
  pricePerLitre: number;
}

/**
 * Cache device auth data to avoid DB hit on every request.
 * At 1000 devices × multiple requests/minute, this prevents DB overload.
 */
export async function cacheDeviceAuth(deviceId: string, data: CachedDeviceAuth): Promise<void> {
  await cacheSetJson(`device:${deviceId}`, data, DEVICE_AUTH_TTL);
}

export async function getCachedDeviceAuth(deviceId: string): Promise<CachedDeviceAuth | null> {
  return cacheGetJson<CachedDeviceAuth>(`device:${deviceId}`);
}

export async function invalidateDeviceAuth(deviceId: string): Promise<void> {
  await cacheDel(`device:${deviceId}`);
}

// ─── Machine Status Cache ───────────────────────────────────────

/**
 * Cache machine online/offline status for dashboard.
 * Avoids scanning all 1000 machines on every dashboard load.
 */
export async function cacheFleetStatus(overview: Record<string, number>): Promise<void> {
  await cacheSetJson("fleet:status", overview, 30); // 30-second TTL
}

export async function getCachedFleetStatus(): Promise<Record<string, number> | null> {
  return cacheGetJson("fleet:status");
}

export { getRedis, isRedisAvailable };
