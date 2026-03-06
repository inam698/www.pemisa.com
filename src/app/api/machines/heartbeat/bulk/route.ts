/**
 * POST /api/machines/heartbeat/bulk
 * Batch heartbeat processing for gateway / aggregator setups.
 * A single gateway can forward heartbeats from many dispensers in one request,
 * reducing HTTP overhead from 17 req/s to < 1 req/s at 1000 devices.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/middleware/rateLimiter";
import { bulkHeartbeatSchema } from "@/lib/validators";
import { processBulkHeartbeats } from "@/services/machineService";

async function bulkHeartbeatHandler(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = bulkHeartbeatSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // Validate gateway API key (uses a shared gateway secret)
    const gatewayKey = request.headers.get("x-gateway-key");
    const expectedKey = process.env.GATEWAY_API_KEY;
    if (!expectedKey || gatewayKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: "Invalid gateway key" },
        { status: 401 }
      );
    }

    const results = await processBulkHeartbeats(validation.data.heartbeats);

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      succeeded,
      failed,
      results,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Bulk heartbeat error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process bulk heartbeats" },
      { status: 500 }
    );
  }
}

// 10 bulk requests per 15 minutes per gateway IP
export const POST = withRateLimit(
  bulkHeartbeatHandler,
  10,
  15 * 60 * 1000,
  "bulk-heartbeat"
);
