/**
 * Temporary Seed Endpoint — populates the database with realistic demo data.
 * Protected by a secret header. Remove after use.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SEED_SECRET = process.env.MIGRATE_SECRET || "bb416eb82d6c9ceda6d3";

function generateVoucherCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateApiKey(): string {
  return `pimisa_${crypto.randomBytes(24).toString("hex")}`;
}

function randomDate(startDays: number, endDays: number): Date {
  const start = Date.now() - startDays * 24 * 60 * 60 * 1000;
  const end = Date.now() - endDays * 24 * 60 * 60 * 1000;
  return new Date(start + Math.random() * (end - start));
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-seed-secret");
  if (secret !== SEED_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // ─── 1. Create Stations ─────────────────────────────────────
    const stationConfigs = [
      { id: "station-lusaka-01", name: "Pimisa Lusaka Main", location: "Cairo Road, Lusaka" },
      { id: "station-lusaka-02", name: "Pimisa Lusaka East", location: "Great East Road, Lusaka" },
      { id: "station-kitwe-01", name: "Pimisa Kitwe Branch", location: "Freedom Avenue, Kitwe" },
      { id: "station-ndola-01", name: "Pimisa Ndola Branch", location: "Broadway, Ndola" },
      { id: "station-livingstone-01", name: "Pimisa Livingstone", location: "Mosi-oa-Tunya Road, Livingstone" },
    ];

    for (const s of stationConfigs) {
      await prisma.station.upsert({
        where: { id: s.id },
        update: {},
        create: { id: s.id, stationName: s.name, location: s.location },
      });
    }
    results.push(`✅ ${stationConfigs.length} stations created`);

    // ─── 2. Create Station Users ────────────────────────────────
    const stationPwHash = await bcrypt.hash("Station@123", 12);
    const stationUserConfigs = [
      { name: "Lusaka Main Attendant", email: "lusaka@pimisa.com", stationId: "station-lusaka-01" },
      { name: "Lusaka East Attendant", email: "lusaka.east@pimisa.com", stationId: "station-lusaka-02" },
      { name: "Kitwe Attendant", email: "kitwe@pimisa.com", stationId: "station-kitwe-01" },
      { name: "Ndola Attendant", email: "ndola@pimisa.com", stationId: "station-ndola-01" },
      { name: "Livingstone Attendant", email: "livingstone@pimisa.com", stationId: "station-livingstone-01" },
    ];

    for (const u of stationUserConfigs) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          name: u.name,
          email: u.email,
          passwordHash: stationPwHash,
          role: "STATION",
          stationId: u.stationId,
        },
      });
    }
    results.push(`✅ ${stationUserConfigs.length} station users created`);

    // ─── 3. Create Machines (IoT Dispensers) ────────────────────
    const machineConfigs = [
      { deviceId: "DISP-LSK-001", name: "Lusaka Dispenser 1", stationId: "station-lusaka-01", location: "Cairo Road" },
      { deviceId: "DISP-LSK-002", name: "Lusaka Dispenser 2", stationId: "station-lusaka-01", location: "Manda Hill" },
      { deviceId: "DISP-LSK-003", name: "Lusaka East Dispenser", stationId: "station-lusaka-02", location: "Great East Road" },
      { deviceId: "DISP-KTW-001", name: "Kitwe Dispenser 1", stationId: "station-kitwe-01", location: "Freedom Avenue" },
      { deviceId: "DISP-KTW-002", name: "Kitwe Dispenser 2", stationId: "station-kitwe-01", location: "President Ave" },
      { deviceId: "DISP-NDL-001", name: "Ndola Dispenser 1", stationId: "station-ndola-01", location: "Broadway" },
      { deviceId: "DISP-LIV-001", name: "Livingstone Dispenser", stationId: "station-livingstone-01", location: "Mosi-oa-Tunya Rd" },
    ];

    const machineKeys: string[] = [];
    for (const m of machineConfigs) {
      const plainKey = generateApiKey();
      const apiKeyHash = await bcrypt.hash(plainKey, 10);
      const apiKeySuffix = plainKey.slice(-8);
      await prisma.machine.upsert({
        where: { deviceId: m.deviceId },
        update: {},
        create: {
          deviceId: m.deviceId,
          name: m.name,
          apiKeyHash,
          apiKeySuffix,
          stationId: m.stationId,
          location: m.location,
          status: ["ONLINE", "ONLINE", "OFFLINE", "ONLINE", "MAINTENANCE", "ONLINE", "ONLINE"][machineConfigs.indexOf(m)],
          pricePerLitre: 45.0,
          firmwareVersion: "2.1.0",
          heartbeatInterval: 60,
          lastSeen: randomDate(0, 1),
          oilLevel: 60 + Math.random() * 30,
          oilRemainingLitres: 2000 + Math.random() * 3000,
          totalDispensed: 500 + Math.random() * 2000,
        },
      });
      machineKeys.push(`${m.deviceId}: ${plainKey}`);
    }
    results.push(`✅ ${machineConfigs.length} machines created`);

    // ─── 4. Create Vouchers (mix of statuses) ──────────────────
    const beneficiaries = [
      { name: "John Mwanza", phone: "+260971234567" },
      { name: "Grace Banda", phone: "+260972345678" },
      { name: "Peter Tembo", phone: "+260973456789" },
      { name: "Mary Phiri", phone: "+260974567890" },
      { name: "David Zulu", phone: "+260975678901" },
      { name: "Esther Mumba", phone: "+260976789012" },
      { name: "Joseph Lungu", phone: "+260977890123" },
      { name: "Charity Mulenga", phone: "+260978901234" },
      { name: "Samuel Kabwe", phone: "+260979012345" },
      { name: "Ruth Chanda", phone: "+260970123456" },
      { name: "Michael Chilufya", phone: "+260961234567" },
      { name: "Agnes Bwalya", phone: "+260962345678" },
      { name: "Patrick Musonda", phone: "+260963456789" },
      { name: "Florence Ngosa", phone: "+260964567890" },
      { name: "Stephen Kapata", phone: "+260965678901" },
      { name: "Brenda Mwila", phone: "+260966789012" },
      { name: "Thomas Kasonde", phone: "+260967890123" },
      { name: "Jane Chimba", phone: "+260968901234" },
      { name: "Daniel Chola", phone: "+260969012345" },
      { name: "Alice Mwape", phone: "+260960123456" },
    ];

    const stations = stationConfigs.map(s => s.id);
    const amounts = [22.5, 45.0, 67.5, 90.0, 112.5];
    let voucherCount = 0;

    // Delete existing vouchers to avoid code conflicts
    await prisma.voucher.deleteMany({});
    results.push("✅ Cleared existing vouchers");

    for (let i = 0; i < 100; i++) {
      const b = beneficiaries[i % beneficiaries.length];
      const stationId = stations[i % stations.length];
      const amount = amounts[i % amounts.length];
      const litres = amount / 45.0;
      const code = generateVoucherCode() + String(i).padStart(3, "0");

      // Distribute statuses: 40 UNUSED, 45 USED, 15 EXPIRED
      let status: string;
      let redeemedAt: Date | null = null;
      let expiryDate: Date;

      if (i < 40) {
        status = "UNUSED";
        expiryDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      } else if (i < 85) {
        status = "USED";
        redeemedAt = randomDate(30, 1);
        expiryDate = new Date(redeemedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
      } else {
        status = "EXPIRED";
        expiryDate = randomDate(60, 31);
      }

      const createdAt = i < 40 ? randomDate(7, 0) : randomDate(60, 0);

      await prisma.voucher.create({
        data: {
          name: b.name,
          phone: b.phone,
          amount,
          litres,
          voucherCode: code,
          status,
          expiryDate,
          stationId,
          redeemedAt,
          createdAt,
        },
      });
      voucherCount++;
    }
    results.push(`✅ ${voucherCount} vouchers created (40 unused, 45 used, 15 expired)`);

    // ─── 5. Create some Transactions + Sales ─────────────────────
    // First get machine records (we need their internal id, not deviceId)
    const machineRecords = await prisma.machine.findMany({
      select: { id: true, deviceId: true, stationId: true },
    });

    const usedVouchers = await prisma.voucher.findMany({
      where: { status: "USED" },
      take: 30,
    });

    let txCount = 0;
    for (const v of usedVouchers) {
      const machineRec = machineRecords[txCount % machineRecords.length];
      // Create Transaction (IoT log)
      await prisma.transaction.create({
        data: {
          machineId: machineRec.id,
          deviceId: machineRec.deviceId,
          type: "voucher",
          voucherCode: v.voucherCode,
          oilMl: v.litres * 1000,
          amountPaid: v.amount,
          oilRemainingAfter: 4500 - txCount * 50,
          createdAt: v.redeemedAt || new Date(),
        },
      });
      // Create Sale record
      await prisma.sale.create({
        data: {
          machineId: machineRec.id,
          deviceId: machineRec.deviceId,
          stationId: machineRec.stationId || stations[0],
          litres: v.litres,
          amount: v.amount,
          paymentType: "voucher",
          voucherCode: v.voucherCode,
          phone: v.phone,
          createdAt: v.redeemedAt || new Date(),
        },
      });
      txCount++;
    }
    results.push(`✅ ${txCount} transactions + sales created`);

    // ─── 6. Create Audit Logs ───────────────────────────────────
    const auditActions = [
      "USER_LOGIN", "VOUCHER_GENERATED", "VOUCHER_REDEEMED",
      "STATION_CREATED", "MACHINE_REGISTERED", "SETTINGS_UPDATED",
      "USER_CREATED", "EXPORT_PDF",
    ];

    for (let i = 0; i < 50; i++) {
      await prisma.auditLog.create({
        data: {
          action: auditActions[i % auditActions.length],
          actor: "admin@pimisa.com",
          actorRole: "ADMIN",
          target: i % 3 === 0 ? "voucher" : i % 3 === 1 ? "station" : "user",
          details: JSON.stringify({ action: auditActions[i % auditActions.length], ip: "41.72.100." + (i % 255) }),
          ipAddress: "41.72.100." + (i % 255),
          createdAt: randomDate(30, 0),
        },
      });
    }
    results.push("✅ 50 audit logs created");

    return NextResponse.json({
      success: true,
      results,
      machineKeys: machineKeys.slice(0, 3), // Only show first 3 for brevity
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Seed failed",
      results,
    }, { status: 500 });
  }
}
