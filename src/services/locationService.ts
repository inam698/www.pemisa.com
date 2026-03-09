/**
 * Location Service
 * Fleet management through geographic locations.
 * Groups machines into locations for easier monitoring and administration.
 */

import prisma from "@/lib/db/prisma";

// ─── Location CRUD ──────────────────────────────────────────────

export async function createLocation(data: {
  name: string;
  address?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
}) {
  return prisma.location.create({
    data: {
      name: data.name,
      address: data.address || "",
      city: data.city || "",
      region: data.region || "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });
}

export async function updateLocation(
  id: string,
  data: {
    name?: string;
    address?: string;
    city?: string;
    region?: string;
    latitude?: number | null;
    longitude?: number | null;
  }
) {
  return prisma.location.update({
    where: { id },
    data,
  });
}

export async function deleteLocation(id: string) {
  // Unlink machines before deleting
  await prisma.machine.updateMany({
    where: { locationId: id },
    data: { locationId: null },
  });
  return prisma.location.delete({ where: { id } });
}

export async function getLocations(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (params?.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { city: { contains: params.search, mode: "insensitive" } },
      { region: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: {
        machines: {
          select: { id: true, deviceId: true, name: true, status: true, oilRemainingLitres: true },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.location.count({ where }),
  ]);

  return {
    data: data.map((loc) => ({
      ...loc,
      machineCount: loc.machines.length,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getLocationById(id: string) {
  return prisma.location.findUnique({
    where: { id },
    include: {
      machines: {
        select: {
          id: true,
          deviceId: true,
          name: true,
          status: true,
          lastSeen: true,
          oilRemainingLitres: true,
          oilCapacityLitres: true,
          pricePerLitre: true,
          firmwareVersion: true,
        },
      },
    },
  });
}

// ─── Fleet Overview ─────────────────────────────────────────────

const LOW_OIL_THRESHOLD = 0.15; // 15% of capacity

export async function getFleetOverview() {
  const [locations, machines] = await Promise.all([
    prisma.location.findMany({
      include: {
        machines: {
          select: {
            id: true,
            deviceId: true,
            name: true,
            status: true,
            oilRemainingLitres: true,
            oilCapacityLitres: true,
            pricePerLitre: true,
            lastSeen: true,
            firmwareVersion: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.machine.findMany({
      select: { id: true, status: true, oilRemainingLitres: true, oilCapacityLitres: true },
    }),
  ]);

  const totalMachines = machines.length;
  const onlineMachines = machines.filter((m) => m.status === "ONLINE").length;
  const offlineMachines = machines.filter((m) => m.status === "OFFLINE").length;
  const lowOilMachines = machines.filter(
    (m) => m.oilRemainingLitres / m.oilCapacityLitres < LOW_OIL_THRESHOLD
  ).length;

  return {
    totalLocations: locations.length,
    totalMachines,
    onlineMachines,
    offlineMachines,
    lowOilMachines,
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      city: loc.city,
      region: loc.region,
      latitude: loc.latitude,
      longitude: loc.longitude,
      machineCount: loc.machines.length,
      machines: loc.machines,
      createdAt: loc.createdAt.toISOString(),
      updatedAt: loc.updatedAt.toISOString(),
    })),
  };
}

// ─── Assign Machine to Location ─────────────────────────────────

export async function assignMachineToLocation(machineId: string, locationId: string | null) {
  return prisma.machine.update({
    where: { id: machineId },
    data: { locationId },
  });
}
