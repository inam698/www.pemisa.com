/**
 * Sales Service
 * Records and queries oil dispensing transactions (cash + voucher).
 * Used by IoT dispenser machines and admin dashboard.
 *
 * Scalability: Uses composite indexes [machineId,createdAt], [stationId,createdAt],
 * [paymentType,createdAt] for fast aggregation queries at 50K sales/day.
 */

import prisma from "@/lib/db/prisma";
import { PaymentType } from "@/types";

// ─── Record Sale ────────────────────────────────────────────────

export async function recordSale(data: {
  machineId: string;
  deviceId: string;
  stationId?: string | null;
  litres: number;
  amount: number;
  paymentType: string;
  voucherCode?: string;
  phone?: string;
}) {
  // Also update lifetime dispensed total on the machine
  const [sale] = await prisma.$transaction([
    prisma.sale.create({
      data: {
        machineId: data.machineId,
        deviceId: data.deviceId,
        stationId: data.stationId || null,
        litres: data.litres,
        amount: data.amount,
        paymentType: data.paymentType.toUpperCase() as any,
        voucherCode: data.voucherCode || null,
        phone: data.phone || null,
      },
    }),
    prisma.machine.update({
      where: { id: data.machineId },
      data: { totalDispensed: { increment: data.litres } },
    }),
  ]);

  return sale;
}

// ─── Query Sales ────────────────────────────────────────────────

export async function getSales(params: {
  page?: number;
  pageSize?: number;
  deviceId?: string;
  stationId?: string;
  paymentType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};
  if (params.deviceId) where.deviceId = params.deviceId;
  if (params.stationId) where.stationId = params.stationId;
  if (params.paymentType && params.paymentType !== "ALL") {
    where.paymentType = params.paymentType.toUpperCase();
  }
  if (params.startDate || params.endDate) {
    where.createdAt = {
      ...(params.startDate && { gte: new Date(params.startDate) }),
      ...(params.endDate && { lte: new Date(params.endDate) }),
    };
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        machine: { select: { name: true, deviceId: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    data: sales.map((s: any) => ({
      id: s.id,
      deviceId: s.deviceId,
      machineName: s.machine?.name || "Unknown",
      litres: s.litres,
      amount: s.amount,
      paymentType: s.paymentType,
      voucherCode: s.voucherCode,
      phone: s.phone,
      createdAt: s.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ─── Sales Analytics ────────────────────────────────────────────

export async function getSalesAnalytics() {
  const [
    totalSales,
    cashSales,
    voucherSales,
    totalAggregation,
    cashAggregation,
    voucherAggregation,
  ] = await Promise.all([
    prisma.sale.count(),
    prisma.sale.count({ where: { paymentType: PaymentType.CASH } }),
    prisma.sale.count({ where: { paymentType: PaymentType.VOUCHER } }),
    prisma.sale.aggregate({
      _sum: { litres: true, amount: true },
    }),
    prisma.sale.aggregate({
      _sum: { litres: true, amount: true },
      where: { paymentType: PaymentType.CASH },
    }),
    prisma.sale.aggregate({
      _sum: { litres: true, amount: true },
      where: { paymentType: PaymentType.VOUCHER },
    }),
  ]);

  return {
    totalSales,
    cashSales,
    voucherSales,
    totalLitres: totalAggregation._sum.litres || 0,
    totalRevenue: totalAggregation._sum.amount || 0,
    cashLitres: cashAggregation._sum.litres || 0,
    cashRevenue: cashAggregation._sum.amount || 0,
    voucherLitres: voucherAggregation._sum.litres || 0,
    voucherRevenue: voucherAggregation._sum.amount || 0,
  };
}

/**
 * Daily sales breakdown for charts (last N days).
 */
export async function getDailySales(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: startDate } },
    select: { litres: true, amount: true, paymentType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Aggregate by day
  const dailyMap = new Map<string, {
    date: string;
    cashLitres: number;
    cashAmount: number;
    voucherLitres: number;
    voucherAmount: number;
    totalTransactions: number;
  }>();

  for (const sale of sales) {
    const dateKey = (sale as any).createdAt.toISOString().split("T")[0];
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        cashLitres: 0,
        cashAmount: 0,
        voucherLitres: 0,
        voucherAmount: 0,
        totalTransactions: 0,
      });
    }
    const day = dailyMap.get(dateKey)!;
    day.totalTransactions++;
    if ((sale as any).paymentType === PaymentType.CASH) {
      day.cashLitres += sale.litres;
      day.cashAmount += sale.amount;
    } else {
      day.voucherLitres += sale.litres;
      day.voucherAmount += sale.amount;
    }
  }

  return Array.from(dailyMap.values());
}

/**
 * Sales breakdown by machine for leaderboard.
 */
export async function getSalesByMachine() {
  const machines = await prisma.machine.findMany({
    include: {
      sales: {
        select: { litres: true, amount: true, paymentType: true },
      },
      station: { select: { stationName: true } },
    },
  });

  return machines
    .map((m: any) => {
      const totalLitres = m.sales.reduce((s: number, sale: any) => s + sale.litres, 0);
      const totalRevenue = m.sales.reduce((s: number, sale: any) => s + sale.amount, 0);
      return {
        deviceId: m.deviceId,
        name: m.name,
        stationName: m.station?.stationName || null,
        totalSales: m.sales.length,
        totalLitres,
        totalRevenue,
      };
    })
    .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);
}
