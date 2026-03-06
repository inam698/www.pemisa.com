/**
 * Monitoring Service
 * Handles alert generation and machine health checks.
 * Works with the event bus for real-time dashboard updates.
 */

import prisma from "@/lib/db/prisma";
import { MachineStatus } from "@/types";

export interface MonitoringAlert {
  type: "low_oil" | "offline" | "pump_failure" | "low_tank";
  deviceId: string;
  machineName: string;
  message: string;
  severity: "warning" | "critical";
  timestamp: string;
}

/**
 * Get all active alerts based on current machine states.
 * Checks for: low oil, offline machines, and pump failure indicators.
 */
export async function getActiveAlerts(): Promise<MonitoringAlert[]> {
  const alerts: MonitoringAlert[] = [];

  // Use findMany without select to get all fields including new monitoring columns
  // The `as any` cast is needed until `prisma generate` runs after migration
  const machines = await (prisma.machine.findMany() as Promise<any[]>);

  const now = Date.now();

  for (const machine of machines) {
    // Low oil alert: oil_level < 10%
    if (machine.oilLevel != null && machine.oilLevel < 10) {
      alerts.push({
        type: "low_oil",
        deviceId: machine.deviceId,
        machineName: machine.name,
        message: `Oil level critically low: ${machine.oilLevel.toFixed(1)}%`,
        severity: machine.oilLevel < 5 ? "critical" : "warning",
        timestamp: new Date().toISOString(),
      });
    }

    // Offline alert: no heartbeat for 2+ minutes
    if (
      machine.status === MachineStatus.OFFLINE &&
      machine.lastSeen
    ) {
      const offlineMs = now - machine.lastSeen.getTime();
      alerts.push({
        type: "offline",
        deviceId: machine.deviceId,
        machineName: machine.name,
        message: `Machine offline for ${formatDuration(offlineMs)}`,
        severity: offlineMs > 10 * 60 * 1000 ? "critical" : "warning",
        timestamp: machine.lastSeen.toISOString(),
      });
    }

    // Pump failure detection: temperature spike above 80°C
    if (machine.temperature != null && machine.temperature > 80) {
      alerts.push({
        type: "pump_failure",
        deviceId: machine.deviceId,
        machineName: machine.name,
        message: `Abnormal temperature detected: ${machine.temperature.toFixed(1)}°C — possible pump failure`,
        severity: "critical",
        timestamp: new Date().toISOString(),
      });
    }

    // Low tank alert: remaining oil below 10% of capacity
    if (machine.oilCapacityLitres > 0 && machine.oilRemainingLitres != null) {
      const tankPercent = (machine.oilRemainingLitres / machine.oilCapacityLitres) * 100;
      if (tankPercent < 10) {
        alerts.push({
          type: "low_tank",
          deviceId: machine.deviceId,
          machineName: machine.name,
          message: `Tank low: ${machine.oilRemainingLitres.toFixed(1)}L / ${machine.oilCapacityLitres.toFixed(0)}L (${tankPercent.toFixed(0)}%)`,
          severity: tankPercent < 5 ? "critical" : "warning",
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Sort by severity (critical first) then by timestamp
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return alerts;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
