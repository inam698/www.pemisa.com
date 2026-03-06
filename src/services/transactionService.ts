/**
 * Transaction Service
 * Unified transaction logging for voucher redemptions and direct purchases.
 * Manages oil inventory tracking and refills.
 */

import prisma from "@/lib/db/prisma";

// ─── Record Transaction ─────────────────────────────────────────

export async function recordTransaction(data: {
  machineId: string;
  deviceId: string;
  type: "voucher" | "purchase";
  voucherCode?: string;
  oilMl: number;
  amountPaid?: number;
}) {
  const oilLitres = data.oilMl / 1000;

  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      machineId: data.machineId,
      deviceId: data.deviceId,
      type: data.type,
      voucherCode: data.voucherCode || null,
      oilMl: data.oilMl,
      amountPaid: data.amountPaid ?? null,
    },
  });

  // Decrement oil remaining and increment total dispensed
  await prisma.machine.update({
    where: { id: data.machineId },
    data: {
      oilRemainingLitres: { decrement: oilLitres },
      totalDispensed: { increment: oilLitres },
    },
  });

  // Fetch updated remaining and store it on the transaction
  const machine = await prisma.machine.findUnique({
    where: { id: data.machineId },
    select: { oilRemainingLitres: true },
  });

  const remaining = machine?.oilRemainingLitres ?? null;
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { oilRemainingAfter: remaining },
  });

  return { ...transaction, oilRemainingAfter: remaining };
}

// ─── Refill Tank ────────────────────────────────────────────────

export async function refillTank(machineId: string, litres: number) {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { oilCapacityLitres: true, oilRemainingLitres: true },
  });
  if (!machine) throw new Error("Machine not found");

  const newRemaining = Math.min(
    machine.oilRemainingLitres + litres,
    machine.oilCapacityLitres
  );

  const updated = await prisma.machine.update({
    where: { id: machineId },
    data: { oilRemainingLitres: newRemaining },
    select: {
      deviceId: true,
      name: true,
      oilCapacityLitres: true,
      oilRemainingLitres: true,
    },
  });

  return {
    deviceId: updated.deviceId,
    name: updated.name,
    oilCapacityLitres: updated.oilCapacityLitres,
    oilRemainingLitres: updated.oilRemainingLitres,
    litresAdded: newRemaining - machine.oilRemainingLitres,
  };
}

// ─── Get Transactions ───────────────────────────────────────────

export async function getTransactions(params: {
  page?: number;
  pageSize?: number;
  machineId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};
  if (params.machineId) where.machineId = params.machineId;
  if (params.type && params.type !== "all") where.type = params.type;
  if (params.startDate || params.endDate) {
    where.createdAt = {
      ...(params.startDate && { gte: new Date(params.startDate) }),
      ...(params.endDate && { lte: new Date(params.endDate) }),
    };
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        machine: { select: { name: true, deviceId: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data: transactions.map((t) => ({
      id: t.id,
      machineId: t.machineId,
      deviceId: t.deviceId,
      machineName: t.machine?.name || "Unknown",
      type: t.type,
      voucherCode: t.voucherCode,
      oilMl: t.oilMl,
      oilLitres: t.oilMl / 1000,
      amountPaid: t.amountPaid,
      oilRemainingAfter: t.oilRemainingAfter,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ─── Transaction Analytics ──────────────────────────────────────

export async function getTransactionAnalytics() {
  const [
    totalCount,
    voucherCount,
    purchaseCount,
    totalAgg,
    voucherAgg,
    purchaseAgg,
  ] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { type: "voucher" } }),
    prisma.transaction.count({ where: { type: "purchase" } }),
    prisma.transaction.aggregate({ _sum: { oilMl: true, amountPaid: true } }),
    prisma.transaction.aggregate({ _sum: { oilMl: true, amountPaid: true }, where: { type: "voucher" } }),
    prisma.transaction.aggregate({ _sum: { oilMl: true, amountPaid: true }, where: { type: "purchase" } }),
  ]);

  return {
    totalTransactions: totalCount,
    voucherTransactions: voucherCount,
    purchaseTransactions: purchaseCount,
    totalOilMl: totalAgg._sum?.oilMl || 0,
    totalOilLitres: (totalAgg._sum?.oilMl || 0) / 1000,
    totalRevenue: totalAgg._sum?.amountPaid || 0,
    voucherOilLitres: (voucherAgg._sum?.oilMl || 0) / 1000,
    voucherRevenue: voucherAgg._sum?.amountPaid || 0,
    purchaseOilLitres: (purchaseAgg._sum?.oilMl || 0) / 1000,
    purchaseRevenue: purchaseAgg._sum?.amountPaid || 0,
  };
}

// ─── Machine Inventory ──────────────────────────────────────────

export async function getMachineInventory() {
  const machines = await prisma.machine.findMany({
    select: {
      id: true,
      deviceId: true,
      name: true,
      oilCapacityLitres: true,
      oilRemainingLitres: true,
      status: true,
    },
    orderBy: { oilRemainingLitres: "asc" },
  });

  return machines.map((m) => ({
    id: m.id,
    deviceId: m.deviceId,
    name: m.name,
    status: m.status,
    oilCapacityLitres: m.oilCapacityLitres,
    oilRemainingLitres: Math.max(0, m.oilRemainingLitres),
    oilRemainingPercent: m.oilCapacityLitres > 0
      ? Math.max(0, (m.oilRemainingLitres / m.oilCapacityLitres) * 100)
      : 0,
  }));
}
