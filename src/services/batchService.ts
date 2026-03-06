/**
 * Batch Service
 * Manages voucher batches — listing, details, and revoking.
 */

import prisma from "@/lib/db/prisma";

export async function getBatches(params: { page?: number; pageSize?: number }) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;

  // Get distinct batch IDs with aggregated data
  const batches = await prisma.voucher.groupBy({
    by: ["batchId"],
    _count: { id: true },
    _sum: { amount: true },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: "desc" } },
    where: { batchId: { not: null } },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const totalBatches = await prisma.voucher.groupBy({
    by: ["batchId"],
    where: { batchId: { not: null } },
  });

  // For each batch, get status breakdown
  const enriched = await Promise.all(
    batches.map(async (b: any) => {
      const statusCounts = await prisma.voucher.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { batchId: b.batchId },
      });

      const statusMap: Record<string, number> = {};
      statusCounts.forEach((s: any) => {
        statusMap[s.status] = s._count.id;
      });

      return {
        batchId: b.batchId,
        totalVouchers: b._count.id,
        totalAmount: b._sum.amount || 0,
        unused: statusMap["UNUSED"] || 0,
        used: statusMap["USED"] || 0,
        expired: statusMap["EXPIRED"] || 0,
        createdAt: b._min.createdAt?.toISOString() || "",
      };
    })
  );

  return {
    data: enriched,
    total: totalBatches.length,
    page,
    pageSize,
    totalPages: Math.ceil(totalBatches.length / pageSize),
  };
}

/**
 * Revoke (expire) all unused vouchers in a batch
 */
export async function revokeBatch(batchId: string) {
  const result = await prisma.voucher.updateMany({
    where: { batchId, status: "UNUSED" },
    data: { status: "EXPIRED" },
  });
  return { revokedCount: result.count };
}
