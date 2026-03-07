/**
 * GET /api/health
 * Health check endpoint for load balancers, monitoring, and Docker health checks.
 * Checks database and Redis connectivity.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { cacheSet, cacheGet } from "@/lib/cache/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};
  let healthy = true;

  // Check database
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (error) {
    healthy = false;
    checks.database = {
      status: "error",
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    const testKey = "health:ping";
    await cacheSet(testKey, "pong", 10);
    const result = await cacheGet(testKey);
    checks.redis = {
      status: result === "pong" ? "ok" : "degraded",
      latencyMs: Date.now() - redisStart,
    };
  } catch (error) {
    checks.redis = {
      status: "degraded",
      latencyMs: Date.now() - redisStart,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }

  const response = {
    status: healthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || "1.0.0",
    uptime: process.uptime(),
    checks,
  };

  return NextResponse.json(response, {
    status: healthy ? 200 : 503,
  });
}
