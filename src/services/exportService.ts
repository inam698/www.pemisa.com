/**
 * Export Service
 * Generates CSV data for vouchers, batches, stations, and audit logs.
 */

import prisma from "@/lib/db/prisma";

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Export vouchers as CSV string.
 */
export async function exportVouchersCsv(filters?: {
  status?: string;
  batchId?: string;
  from?: string;
  to?: string;
}): Promise<string> {
  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== "ALL") where.status = filters.status;
  if (filters?.batchId) where.batchId = filters.batchId;
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) (where.createdAt as any).gte = new Date(filters.from);
    if (filters.to) (where.createdAt as any).lte = new Date(filters.to);
  }

  const vouchers = await prisma.voucher.findMany({
    where,
    include: { station: true },
    orderBy: { createdAt: "desc" },
  });

  const header = toCsvRow([
    "ID", "Name", "Phone", "Amount", "Voucher Code", "Status",
    "Station", "Batch ID", "Redeemed At", "Expiry Date", "Created At",
  ]);

  const rows = vouchers.map((v: any) =>
    toCsvRow([
      v.id, v.name, v.phone, v.amount, v.voucherCode, v.status,
      v.station?.stationName || "", v.batchId || "", 
      v.redeemedAt?.toISOString() || "", v.expiryDate.toISOString(), v.createdAt.toISOString(),
    ])
  );

  return [header, ...rows].join("\n");
}

/**
 * Export station performance as CSV.
 */
export async function exportStationsCsv(): Promise<string> {
  const stations = await prisma.station.findMany({
    include: {
      vouchers: { select: { status: true, amount: true } },
      _count: { select: { users: true } },
    },
  });

  const header = toCsvRow([
    "Station Name", "Location", "Users", "Total Vouchers",
    "Redeemed", "Unused", "Expired", "Total Redeemed Amount",
  ]);

  const rows = stations.map((s: any) => {
    const used = s.vouchers.filter((v: any) => v.status === "USED");
    const unused = s.vouchers.filter((v: any) => v.status === "UNUSED");
    const expired = s.vouchers.filter((v: any) => v.status === "EXPIRED");
    const totalAmt = used.reduce((sum: number, v: any) => sum + v.amount, 0);

    return toCsvRow([
      s.stationName, s.location, s._count.users, s.vouchers.length,
      used.length, unused.length, expired.length, totalAmt,
    ]);
  });

  return [header, ...rows].join("\n");
}

/**
 * Export audit logs as CSV.
 */
export async function exportAuditLogsCsv(filters?: {
  from?: string;
  to?: string;
}): Promise<string> {
  const where: Record<string, unknown> = {};
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) (where.createdAt as any).gte = new Date(filters.from);
    if (filters.to) (where.createdAt as any).lte = new Date(filters.to);
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const header = toCsvRow(["ID", "Action", "Actor", "Role", "Target", "Details", "IP", "Timestamp"]);

  const rows = logs.map((l: any) =>
    toCsvRow([l.id, l.action, l.actor, l.actorRole, l.target || "", l.details || "", l.ipAddress || "", l.createdAt.toISOString()])
  );

  return [header, ...rows].join("\n");
}

/**
 * Dashboard analytics data for charts.
 */
export async function getChartData() {
  // Daily redemptions for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const vouchers = await prisma.voucher.findMany({
    where: {
      status: "USED",
      redeemedAt: { gte: thirtyDaysAgo },
    },
    select: { redeemedAt: true, amount: true },
    orderBy: { redeemedAt: "asc" },
  });

  // Group by date
  const dailyMap = new Map<string, { count: number; amount: number }>();
  for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, { count: 0, amount: 0 });
  }

  vouchers.forEach((v: any) => {
    if (v.redeemedAt) {
      const key = v.redeemedAt.toISOString().split("T")[0];
      const entry = dailyMap.get(key) || { count: 0, amount: 0 };
      entry.count++;
      entry.amount += v.amount;
      dailyMap.set(key, entry);
    }
  });

  const dailyRedemptions = Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    count: data.count,
    amount: data.amount,
  }));

  // Status distribution
  const statusCounts = await prisma.voucher.groupBy({
    by: ["status"],
    _count: { id: true },
    _sum: { amount: true },
  });

  const statusDistribution = statusCounts.map((s: any) => ({
    status: s.status,
    count: s._count.id,
    amount: s._sum.amount || 0,
  }));

  // Top stations by redemptions
  const stationPerformance = await prisma.station.findMany({
    include: {
      vouchers: {
        where: { status: "USED" },
        select: { amount: true },
      },
    },
  });

  const stationData = stationPerformance
    .map((s: any) => ({
      stationName: s.stationName,
      redemptions: s.vouchers.length,
      amount: s.vouchers.reduce((sum: number, v: any) => sum + v.amount, 0),
    }))
    .sort((a: any, b: any) => b.redemptions - a.redemptions);

  return { dailyRedemptions, statusDistribution, stationData };
}
