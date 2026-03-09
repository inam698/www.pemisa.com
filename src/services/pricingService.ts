/**
 * Pricing Service
 * Dynamic pricing rules for IoT dispenser machines.
 * Supports time-based price overrides per machine.
 */

import prisma from "@/lib/db/prisma";

// ─── Get Current Price ──────────────────────────────────────────

/**
 * Returns the effective price for a machine right now.
 * Checks active pricing rules first, falls back to machine.pricePerLitre.
 */
export async function getCurrentPrice(machineId: string) {
  const now = new Date();

  // Find the most recently created active rule covering "now"
  const rule = await prisma.pricingRule.findFirst({
    where: {
      machineId,
      isActive: true,
      startTime: { lte: now },
      endTime: { gte: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (rule) {
    return {
      pricePerLitre: rule.pricePerLitre,
      source: "rule" as const,
      ruleId: rule.id,
    };
  }

  // Fallback to machine default price
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { pricePerLitre: true },
  });

  return {
    pricePerLitre: machine?.pricePerLitre ?? 45.0,
    source: "default" as const,
  };
}

/**
 * Get current price by deviceId (for device-facing endpoints).
 */
export async function getCurrentPriceByDeviceId(deviceId: string) {
  const machine = await prisma.machine.findUnique({
    where: { deviceId },
    select: { id: true, pricePerLitre: true },
  });

  if (!machine) return null;

  return getCurrentPrice(machine.id);
}

// ─── CRUD: Pricing Rules ────────────────────────────────────────

export async function createPricingRule(data: {
  machineId: string;
  pricePerLitre: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}) {
  return prisma.pricingRule.create({
    data: {
      machineId: data.machineId,
      pricePerLitre: data.pricePerLitre,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      isActive: data.isActive ?? true,
    },
  });
}

export async function updatePricingRule(
  id: string,
  data: {
    pricePerLitre?: number;
    startTime?: string;
    endTime?: string;
    isActive?: boolean;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.pricePerLitre !== undefined) updateData.pricePerLitre = data.pricePerLitre;
  if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime);
  if (data.endTime !== undefined) updateData.endTime = new Date(data.endTime);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return prisma.pricingRule.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePricingRule(id: string) {
  return prisma.pricingRule.delete({ where: { id } });
}

export async function getPricingRules(machineId: string) {
  return prisma.pricingRule.findMany({
    where: { machineId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllPricingRules(params?: {
  page?: number;
  pageSize?: number;
  activeOnly?: boolean;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (params?.activeOnly) where.isActive = true;

  const [data, total] = await Promise.all([
    prisma.pricingRule.findMany({
      where,
      include: { machine: { select: { deviceId: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.pricingRule.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
