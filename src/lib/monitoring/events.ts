/**
 * Real-time Monitoring Event Bus
 * In-process event emitter for pushing heartbeat updates to SSE clients.
 * Supports multiple concurrent admin dashboard connections.
 */

export interface HeartbeatEvent {
  deviceId: string;
  status: string;
  oilLevel: number | null;
  temperature: number | null;
  pumpCycles: number | null;
  lastVoucher: string | null;
  lastSeen: string;
}

export interface MonitoringAlert {
  type: "low_oil" | "offline" | "pump_failure";
  deviceId: string;
  message: string;
  timestamp: string;
}

export interface RedemptionEvent {
  voucherCode: string;
  beneficiary: string;
  amount: number;
  litres: number;
  deviceId: string | null;
  stationId: string;
  timestamp: string;
}

type Listener = (event: HeartbeatEvent) => void;
type AlertListener = (alert: MonitoringAlert) => void;
type RedemptionListener = (event: RedemptionEvent) => void;

class MonitoringEventBus {
  private listeners = new Set<Listener>();
  private alertListeners = new Set<AlertListener>();
  private redemptionListeners = new Set<RedemptionListener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeAlerts(listener: AlertListener): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  subscribeRedemptions(listener: RedemptionListener): () => void {
    this.redemptionListeners.add(listener);
    return () => this.redemptionListeners.delete(listener);
  }

  publish(event: HeartbeatEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  publishAlert(alert: MonitoringAlert) {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch {
        // Ignore listener errors
      }
    }
  }

  publishRedemption(event: RedemptionEvent) {
    for (const listener of this.redemptionListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// Singleton - persists across hot reloads in dev
const globalForBus = globalThis as unknown as { monitoringEventBus?: MonitoringEventBus };
export const monitoringEventBus = globalForBus.monitoringEventBus ??= new MonitoringEventBus();

/**
 * Called by heartbeat API handlers to push updates to dashboard clients.
 * Also triggers monitoring alerts for abnormal conditions.
 */
export function publishHeartbeatEvent(event: HeartbeatEvent) {
  monitoringEventBus.publish(event);

  // Check for alert conditions
  if (event.oilLevel != null && event.oilLevel < 10) {
    monitoringEventBus.publishAlert({
      type: "low_oil",
      deviceId: event.deviceId,
      message: `Oil level critically low: ${event.oilLevel.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Called when a machine is detected as offline (stale status sweep).
 */
/**
 * Called when a voucher is redeemed (device or dashboard).
 * Pushes real-time notification to admin SSE clients.
 */
export function publishRedemptionEvent(event: RedemptionEvent) {
  monitoringEventBus.publishRedemption(event);
}

export function publishOfflineAlert(deviceId: string) {
  monitoringEventBus.publishAlert({
    type: "offline",
    deviceId,
    message: `Machine went offline — no heartbeat received`,
    timestamp: new Date().toISOString(),
  });
}
