/**
 * Machine Service
 * CRUD operations and status management for IoT dispenser machines.
 * Handles registration, heartbeat, telemetry, OTA, and monitoring.
 *
 * Scalability (1000+ devices):
 * - API keys are bcrypt-hashed (never stored in plaintext)
 * - Bulk heartbeat processing in a single DB transaction
 * - Telemetry written to dedicated time-series table
 * - OTA firmware check returns update URL + checksum
 * - Stale-status sweep uses composite index [status, lastSeen]
 */

import prisma from "@/lib/db/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { MachineStatus } from "@/types";
import {
  invalidateDeviceAuth,
  cacheFleetStatus,
  getCachedFleetStatus,
} from "@/lib/cache/redis";

const BCRYPT_ROUNDS = 10;

// ─── Helpers ────────────────────────────────────────────────────

/** Generates a cryptographically secure API key (returned once to admin). */
function generateApiKey(): string {
  return `pimisa_${crypto.randomBytes(32).toString("hex")}`;
}

/** Generates a unique device ID like `DISP-XXXX-XXXX`. */
async function generateDeviceId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const seg1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const seg2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const id = `DISP-${seg1}-${seg2}`;
    const existing = await prisma.machine.findUnique({ where: { deviceId: id } });
    if (!existing) return id;
  }
  throw new Error("Unable to generate unique device ID");
}

// ─── Machine CRUD ───────────────────────────────────────────────

export async function createMachine(data: {
  name: string;
  location?: string;
  stationId?: string;
  pricePerLitre?: number;
}) {
  const deviceId = await generateDeviceId();
  const plaintextKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(plaintextKey, BCRYPT_ROUNDS);
  const apiKeySuffix = plaintextKey.slice(-8);

  const machine = await prisma.machine.create({
    data: {
      deviceId,
      apiKeyHash,
      apiKeySuffix,
      name: data.name,
      location: data.location || "",
      stationId: data.stationId || null,
      pricePerLitre: data.pricePerLitre || 45.0,
      status: MachineStatus.OFFLINE,
    },
    include: { station: true },
  });

  return {
    id: machine.id,
    deviceId: machine.deviceId,
    apiKey: plaintextKey, // Only returned on creation! Never stored in plaintext.
    apiKeySuffix,
    name: machine.name,
    location: machine.location,
    stationName: machine.station?.stationName || null,
    pricePerLitre: machine.pricePerLitre,
    status: machine.status,
    createdAt: machine.createdAt.toISOString(),
  };
}

export async function getMachines(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  stationId?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};
  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }
  if (params.stationId) {
    where.stationId = params.stationId;
  }
  if (params.search) {
    where.OR = [
      { deviceId: { contains: params.search, mode: "insensitive" } },
      { name: { contains: params.search, mode: "insensitive" } },
      { location: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      include: {
        station: { select: { stationName: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.machine.count({ where }),
  ]);

  return {
    data: machines.map((m: any) => ({
      id: m.id,
      deviceId: m.deviceId,
      name: m.name,
      location: m.location,
      stationName: m.station?.stationName || null,
      status: m.status,
      lastSeen: m.lastSeen?.toISOString() || null,
      pricePerLitre: m.pricePerLitre,
      firmwareVersion: m.firmwareVersion,
      rssi: m.rssi,
      uptimeSeconds: m.uptimeSeconds,
      totalDispensed: m.totalDispensed,
      apiKeySuffix: m.apiKeySuffix,
      salesCount: m._count.sales,
      createdAt: m.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getMachineById(id: string) {
  const machine = await prisma.machine.findUnique({
    where: { id },
    include: {
      station: { select: { id: true, stationName: true, location: true } },
      _count: { select: { sales: true, telemetry: true } },
    },
  });
  if (!machine) throw new Error("Machine not found");
  return machine;
}

export async function updateMachine(
  id: string,
  data: {
    name?: string;
    location?: string;
    stationId?: string | null;
    pricePerLitre?: number;
    status?: string;
    targetFirmware?: string;
    otaUrl?: string;
    heartbeatInterval?: number;
  }
) {
  // Build update payload with explicit types for Prisma
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.stationId !== undefined) updateData.stationId = data.stationId;
  if (data.pricePerLitre !== undefined) updateData.pricePerLitre = data.pricePerLitre;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.targetFirmware !== undefined) updateData.targetFirmware = data.targetFirmware;
  if (data.otaUrl !== undefined) updateData.otaUrl = data.otaUrl;
  if (data.heartbeatInterval !== undefined) updateData.heartbeatInterval = data.heartbeatInterval;

  const machine = await prisma.machine.update({
    where: { id },
    data: updateData as any,
    include: { station: true },
  });

  // Invalidate device auth cache when machine is updated
  await invalidateDeviceAuth(machine.deviceId);

  return machine;
}

export async function deleteMachine(id: string) {
  const machine = await prisma.machine.findUnique({
    where: { id },
    include: { _count: { select: { sales: true } } },
  });
  if (!machine) throw new Error("Machine not found");
  if (machine._count.sales > 0) {
    throw new Error("Cannot delete machine with recorded sales. Set to MAINTENANCE instead.");
  }
  await invalidateDeviceAuth(machine.deviceId);
  await prisma.machine.delete({ where: { id } });
}

export async function regenerateApiKey(id: string) {
  const plaintextKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(plaintextKey, BCRYPT_ROUNDS);
  const apiKeySuffix = plaintextKey.slice(-8);

  const machine = await prisma.machine.update({
    where: { id },
    data: { apiKeyHash, apiKeySuffix },
  });

  // Invalidate cache so device must re-auth with the new key
  await invalidateDeviceAuth(machine.deviceId);

  return plaintextKey; // Return plaintext once to admin
}

// ─── Heartbeat ──────────────────────────────────────────────────

export interface HeartbeatData {
  firmwareVersion?: string;
  uptimeSeconds?: number;
  rssi?: number;
  freeHeap?: number;
  ipAddress?: string;
  oilLevel?: number;
  temperature?: number;
  pumpCycles?: number;
  lastVoucher?: string;
}

/**
 * Process a single heartbeat from a device.
 * Updates machine status + lightweight telemetry fields.
 */
export async function processHeartbeat(
  deviceId: string,
  firmwareVersion?: string,
  telemetry?: HeartbeatData
) {
  const updateData: Record<string, unknown> = {
    lastSeen: new Date(),
    status: MachineStatus.ONLINE,
  };

  if (firmwareVersion) updateData.firmwareVersion = firmwareVersion;
  if (telemetry?.uptimeSeconds != null) updateData.uptimeSeconds = telemetry.uptimeSeconds;
  if (telemetry?.rssi != null) updateData.rssi = telemetry.rssi;
  if (telemetry?.ipAddress) updateData.ipAddress = telemetry.ipAddress;
  if (telemetry?.oilLevel != null) updateData.oilLevel = telemetry.oilLevel;
  if (telemetry?.temperature != null) updateData.temperature = telemetry.temperature;
  if (telemetry?.pumpCycles != null) updateData.pumpCycles = telemetry.pumpCycles;
  if (telemetry?.lastVoucher) updateData.lastVoucher = telemetry.lastVoucher;

  const machine = await prisma.machine.update({
    where: { deviceId },
    data: updateData,
    select: {
      id: true,
      targetFirmware: true,
      otaUrl: true,
      firmwareVersion: true,
      configVersion: true,
      pricePerLitre: true,
      heartbeatInterval: true,
    },
  });

  // Return config/OTA info for the device to act on
  return {
    configVersion: machine.configVersion,
    pricePerLitre: machine.pricePerLitre,
    heartbeatInterval: machine.heartbeatInterval,
    // Include OTA info if there's a newer firmware available
    ...(machine.targetFirmware &&
      machine.targetFirmware !== machine.firmwareVersion && {
        otaUpdate: {
          version: machine.targetFirmware,
          url: machine.otaUrl,
        },
      }),
  };
}

/**
 * Process heartbeats in bulk (batch of up to 50 devices per request).
 * Reduces HTTP overhead: 1000 devices × 1/60s = 16.7 req/s → 0.33 req/s with batch of 50.
 */
export async function processBulkHeartbeats(
  heartbeats: Array<{
    device_id: string;
    firmware_version?: string;
    uptime_seconds?: number;
    rssi?: number;
    free_heap?: number;
  }>
) {
  const results: Array<{ device_id: string; success: boolean; error?: string }> = [];

  // Process in a transaction for atomicity
  await prisma.$transaction(async (tx) => {
    for (const hb of heartbeats) {
      try {
        await tx.machine.update({
          where: { deviceId: hb.device_id },
          data: {
            lastSeen: new Date(),
            status: MachineStatus.ONLINE,
            ...(hb.firmware_version && { firmwareVersion: hb.firmware_version }),
            ...(hb.uptime_seconds != null && { uptimeSeconds: hb.uptime_seconds }),
            ...(hb.rssi != null && { rssi: hb.rssi }),
          },
        });
        results.push({ device_id: hb.device_id, success: true });
      } catch {
        results.push({ device_id: hb.device_id, success: false, error: "Device not found" });
      }
    }
  });

  return results;
}

// ─── Telemetry ──────────────────────────────────────────────────

/**
 * Record a telemetry snapshot for time-series analytics.
 * Called less frequently than heartbeat (e.g. every 5 minutes).
 */
export async function recordTelemetry(data: {
  machineId: string;
  deviceId: string;
  rssi?: number;
  uptimeSeconds?: number;
  freeHeap?: number;
  temperature?: number;
  pumpCycles?: number;
  errorCount?: number;
}) {
  return prisma.machineTelemetry.create({
    data: {
      machineId: data.machineId,
      deviceId: data.deviceId,
      rssi: data.rssi,
      uptimeSeconds: data.uptimeSeconds,
      freeHeap: data.freeHeap,
      temperature: data.temperature,
      pumpCycles: data.pumpCycles,
      errorCount: data.errorCount,
    },
  });
}

/**
 * Prune telemetry older than retentionDays (default 30).
 * At 1000 machines × 1/min = 1.44M rows/day, pruning is essential.
 */
export async function pruneTelemetry(retentionDays: number = 30) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.machineTelemetry.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

// ─── OTA Firmware ───────────────────────────────────────────────

/**
 * Check if a device needs an OTA update.
 * Called by device during heartbeat or dedicated OTA check.
 */
export async function checkOtaUpdate(deviceId: string, currentVersion: string) {
  const machine = await prisma.machine.findUnique({
    where: { deviceId },
    select: { targetFirmware: true, otaUrl: true },
  });

  if (!machine?.targetFirmware || machine.targetFirmware === currentVersion) {
    return null; // No update needed
  }

  // Look up the firmware release for checksum
  const release = await prisma.firmwareRelease.findUnique({
    where: { version: machine.targetFirmware },
  });

  return {
    version: machine.targetFirmware,
    url: machine.otaUrl || release?.url || null,
    checksum: release?.checksum || null,
    releaseNotes: release?.releaseNotes || null,
  };
}

/**
 * Push an OTA update to a set of machines (by station, status, or all).
 */
export async function pushOtaUpdate(params: {
  firmwareVersion: string;
  otaUrl: string;
  targetStationId?: string;
  targetDeviceIds?: string[];
}) {
  const where: Record<string, unknown> = {};
  if (params.targetStationId) where.stationId = params.targetStationId;
  if (params.targetDeviceIds?.length) where.deviceId = { in: params.targetDeviceIds };

  const result = await prisma.machine.updateMany({
    where,
    data: {
      targetFirmware: params.firmwareVersion,
      otaUrl: params.otaUrl,
    },
  });

  return result.count;
}

// ─── Stale Status ───────────────────────────────────────────────

/**
 * Marks machines as OFFLINE if no heartbeat received within threshold.
 * Uses composite index [status, lastSeen] for efficiency at scale.
 */
export async function updateStaleStatuses(thresholdMinutes: number = 2) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  await prisma.machine.updateMany({
    where: {
      status: MachineStatus.ONLINE,
      lastSeen: { lt: cutoff },
    },
    data: { status: MachineStatus.OFFLINE },
  });
}

// ─── Machine Status Overview ────────────────────────────────────

export async function getMachineStatusOverview() {
  // Check Redis cache first (30s TTL avoids hammering DB on dashboard refresh)
  const cached = await getCachedFleetStatus();
  if (cached) return cached;

  await updateStaleStatuses();

  const [total, online, offline, maintenance] = await Promise.all([
    prisma.machine.count(),
    prisma.machine.count({ where: { status: MachineStatus.ONLINE } }),
    prisma.machine.count({ where: { status: MachineStatus.OFFLINE } }),
    prisma.machine.count({ where: { status: MachineStatus.MAINTENANCE } }),
  ]);

  const overview = { total, online, offline, maintenance };
  await cacheFleetStatus(overview);
  return overview;
}

/**
 * Returns status for all machines (for GET /api/machines/status).
 */
export async function getAllMachineStatuses() {
  await updateStaleStatuses();

  const machines = await prisma.machine.findMany({
    include: {
      station: { select: { stationName: true } },
    },
    orderBy: [{ status: "asc" }, { lastSeen: "desc" }],
  });

  return machines.map((m: any) => ({
    device_id: m.deviceId,
    name: m.name,
    location: m.location,
    station: m.station?.stationName || null,
    status: m.status.toLowerCase(),
    last_seen: m.lastSeen?.toISOString() || null,
    oil_level: m.oilLevel ?? null,
    temperature: m.temperature ?? null,
    pump_cycles: m.pumpCycles ?? null,
    last_voucher: m.lastVoucher ?? null,
    price_per_litre: m.pricePerLitre,
    firmware_version: m.firmwareVersion,
    rssi: m.rssi,
    uptime_seconds: m.uptimeSeconds,
  }));
}
