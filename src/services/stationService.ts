/**
 * Station Service
 * CRUD operations for managing distribution stations.
 */

import prisma from "@/lib/db/prisma";

export async function getStations(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;

  const where: Record<string, unknown> = {};
  if (params.search) {
    where.OR = [
      { stationName: { contains: params.search } },
      { location: { contains: params.search } },
    ];
  }

  const [stations, total] = await Promise.all([
    prisma.station.findMany({
      where,
      include: {
        _count: { select: { users: true, vouchers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.station.count({ where }),
  ]);

  return {
    data: stations.map((s: any) => ({
      id: s.id,
      stationName: s.stationName,
      location: s.location,
      userCount: s._count.users,
      voucherCount: s._count.vouchers,
      createdAt: s.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAllStations() {
  const stations = await prisma.station.findMany({
    orderBy: { stationName: "asc" },
  });
  return stations.map((s: typeof stations[0]) => ({
    id: s.id,
    stationName: s.stationName,
    location: s.location,
  }));
}

export async function createStation(data: { stationName: string; location: string }) {
  const station = await prisma.station.create({ data });
  return {
    id: station.id,
    stationName: station.stationName,
    location: station.location,
  };
}

export async function updateStation(
  id: string,
  data: { stationName?: string; location?: string }
) {
  const station = await prisma.station.update({
    where: { id },
    data: {
      ...(data.stationName && { stationName: data.stationName }),
      ...(data.location && { location: data.location }),
    },
  });
  return {
    id: station.id,
    stationName: station.stationName,
    location: station.location,
  };
}

export async function deleteStation(id: string) {
  // Check if station has users or vouchers
  const station = await prisma.station.findUnique({
    where: { id },
    include: { _count: { select: { users: true, vouchers: true } } },
  });
  if (!station) throw new Error("Station not found");
  if (station._count.users > 0) {
    throw new Error("Cannot delete station with assigned users. Reassign users first.");
  }
  if (station._count.vouchers > 0) {
    throw new Error("Cannot delete station with redeemed vouchers. Unlink vouchers first.");
  }
  await prisma.station.delete({ where: { id } });
}

/**
 * Station performance metrics for leaderboard & analytics
 */
export async function getStationPerformance() {
  const stations = await prisma.station.findMany({
    include: {
      vouchers: {
        select: { status: true, amount: true, redeemedAt: true },
      },
      _count: { select: { users: true } },
    },
  });

  return stations.map((s: any) => {
    const redeemed = s.vouchers.filter((v: any) => v.status === "USED");
    const totalAmount = redeemed.reduce((sum: number, v: any) => sum + v.amount, 0);

    return {
      id: s.id,
      stationName: s.stationName,
      location: s.location,
      totalRedemptions: redeemed.length,
      totalAmount,
      userCount: s._count.users,
    };
  }).sort((a: any, b: any) => b.totalRedemptions - a.totalRedemptions);
}
