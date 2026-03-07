/**
 * POST /api/admin/cleanup-seed
 * Removes seed/demo data from the production database.
 * Keeps: admin user, real machines (those that have sent at least one heartbeat),
 *        real stations with real machines, real vouchers.
 * Removes: sample vouchers (from seed), machines that never connected,
 *          sample beneficiary data, fake station users.
 *
 * TEMPORARY ENDPOINT — delete after running once in production.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { withAdmin } from "@/middleware/authMiddleware";
import { JwtPayload } from "@/types";

// Known seed device IDs (from prisma/seed.ts) — DISP-LSK-001 is real
const SEED_MACHINE_IDS = ["DISP-LSK-002", "DISP-KTW-001", "DISP-NDL-001"];

// Known seed beneficiary phones
const SEED_PHONES = [
  "+260971234567",
  "+260972345678",
  "+260973456789",
  "+260974567890",
  "+260975678901",
];

// Known seed station user emails (keep admin@pimisa.com)
const SEED_STATION_EMAILS = [
  "lusaka@pimisa.com",
  "kitwe@pimisa.com",
  "ndola@pimisa.com",
];

async function handler(request: NextRequest, user: JwtPayload) {
  try {
    const results: Record<string, number> = {};

    // 1. Delete sample vouchers by seed beneficiary phone numbers
    const deletedVouchers = await prisma.voucher.deleteMany({
      where: { phone: { in: SEED_PHONES } },
    });
    results.vouchers_deleted = deletedVouchers.count;

    // 2. Delete seed machines that never connected (lastSeen is null)
    const deletedMachines = await prisma.machine.deleteMany({
      where: {
        deviceId: { in: SEED_MACHINE_IDS },
        lastSeen: null, // Only delete if they never actually connected
      },
    });
    results.machines_deleted = deletedMachines.count;

    // 3. Delete seed station users (not admin)
    const deletedUsers = await prisma.user.deleteMany({
      where: { email: { in: SEED_STATION_EMAILS } },
    });
    results.station_users_deleted = deletedUsers.count;

    // 4. Delete stations that have no machines and no vouchers left
    const emptyStations = await prisma.station.findMany({
      where: {
        machines: { none: {} },
        vouchers: { none: {} },
      },
      select: { id: true, stationName: true },
    });

    if (emptyStations.length > 0) {
      // First delete any users assigned to these stations
      await prisma.user.deleteMany({
        where: { stationId: { in: emptyStations.map((s) => s.id) } },
      });

      const deletedStations = await prisma.station.deleteMany({
        where: { id: { in: emptyStations.map((s) => s.id) } },
      });
      results.empty_stations_deleted = deletedStations.count;
      results.empty_station_names = emptyStations
        .map((s) => s.stationName)
        .join(", ") as unknown as number;
    } else {
      results.empty_stations_deleted = 0;
    }

    // 5. Delete beneficiaries with seed phone numbers that have no remaining vouchers
    const deletedBeneficiaries = await prisma.beneficiary.deleteMany({
      where: {
        phone: { in: SEED_PHONES },
        vouchers: { none: {} },
      },
    });
    results.beneficiaries_deleted = deletedBeneficiaries.count;

    // 6. Summary: count remaining real data
    const [machineCount, stationCount, voucherCount, userCount] =
      await Promise.all([
        prisma.machine.count(),
        prisma.station.count(),
        prisma.voucher.count(),
        prisma.user.count(),
      ]);

    return NextResponse.json({
      success: true,
      message: "Seed data cleanup complete",
      cleaned: results,
      remaining: {
        machines: machineCount,
        stations: stationCount,
        vouchers: voucherCount,
        users: userCount,
      },
    });
  } catch (error: unknown) {
    console.error("Cleanup error:", error);
    const message =
      error instanceof Error ? error.message : "Cleanup failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handler);
