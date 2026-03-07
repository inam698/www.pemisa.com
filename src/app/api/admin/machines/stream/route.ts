/**
 * GET /api/admin/machines/stream
 * Server-Sent Events endpoint for real-time machine monitoring.
 * Pushes heartbeat updates and alerts to admin dashboard clients.
 * Requires admin authentication via Bearer token.
 */

import { NextRequest } from "next/server";
import { verifyFirebaseToken, getAdminFirestore } from "@/lib/firebase/admin";
import { monitoringEventBus, HeartbeatEvent, MonitoringAlert } from "@/lib/monitoring/events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify admin auth - check header first, then query param (for EventSource)
  let token: string | null = null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.nextUrl.searchParams.get("token");
  }

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify Firebase ID token
  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check admin role from Firestore
  const db = getAdminFirestore();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      // Subscribe to heartbeat events
      const unsubHeartbeat = monitoringEventBus.subscribe(
        (event: HeartbeatEvent) => {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "heartbeat", ...event })}\n\n`
              )
            );
          } catch {
            // Stream closed
          }
        }
      );

      // Subscribe to alert events
      const unsubAlerts = monitoringEventBus.subscribeAlerts(
        (alert: MonitoringAlert) => {
          try {
            const payload = {
              type: "alert",
              alertType: alert.type,
              deviceId: alert.deviceId,
              message: alert.message,
              timestamp: alert.timestamp,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
            );
          } catch {
            // Stream closed
          }
        }
      );

      // Keepalive ping every 30s to prevent timeout
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      // Cleanup when client disconnects
      request.signal.addEventListener("abort", () => {
        unsubHeartbeat();
        unsubAlerts();
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
