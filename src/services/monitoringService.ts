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

  // Only fetch machines that could have alerts — uses indexed columns
  // Instead of scanning ALL machines, filter to those with alert conditions
  // Fetch low-tank machines separately (requires computed comparison)
  // For oilLevel, offline, and temperature — use indexed OR filter
  const [alertMachines, lowTankMachines] = await Promise.all([
    prisma.machine.findMany({
      where: {
        OR: [
          { oilLevel: { lt: 10 } },
          { status: "OFFLINE" },
          { temperature: { gt: 80 } },
        ],
      },
      select: {
        deviceId: true,
        name: true,
        status: true,
        lastSeen: true,
        oilLevel: true,
        temperature: true,
        oilCapacityLitres: true,
        oilRemainingLitres: true,
      },
    }),
    // Low tank: fetch machines where remaining < 10% of capacity
    // Use raw query for efficient server-side percentage calculation
    prisma.$queryRaw<Array<{
      device_id: string;
      name: string;
      oil_capacity_litres: number;
      oil_remaining_litres: number;
    }>>`
      SELECT device_id, name, oil_capacity_litres, oil_remaining_litres
      FROM machines
      WHERE oil_capacity_litres > 0
        AND oil_remaining_litres IS NOT NULL
        AND (oil_remaining_litres / oil_capacity_litres) < 0.10
    `,
  ]);

  // Merge and deduplicate by deviceId
  const seenDeviceIds = new Set<string>();
  const machines = alertMachines.map((m) => {
    seenDeviceIds.add(m.deviceId);
    return m;
  });

  // Add low-tank machines that weren't already included
  for (const lt of lowTankMachines) {
    if (!seenDeviceIds.has(lt.device_id)) {
      machines.push({
        deviceId: lt.device_id,
        name: lt.name,
        status: "ONLINE",
        lastSeen: null,
        oilLevel: null,
        temperature: null,
        oilCapacityLitres: lt.oil_capacity_litres,
        oilRemainingLitres: lt.oil_remaining_litres,
      });
    }
  }

  const now = Date.now();

  for (const machine of machines) {
    // Low oil alert: oil level < 10%
    if (machine.oilLevel !== null && machine.oilLevel !== undefined && machine.oilLevel < 10) {
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
    if (machine.temperature !== null && machine.temperature !== undefined && machine.temperature > 80) {
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
