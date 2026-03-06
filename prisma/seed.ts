/**
 * Prisma Seed Script
 * Seeds the database with initial admin user, stations, sample machines, and vouchers.
 * Run: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Enum values (SQLite uses strings, not native enums)
const UserRole = { ADMIN: "ADMIN", STATION: "STATION" } as const;
const MachineStatusEnum = { ONLINE: "ONLINE", OFFLINE: "OFFLINE", MAINTENANCE: "MAINTENANCE" } as const;
const VoucherStatus = { UNUSED: "UNUSED", USED: "USED", EXPIRED: "EXPIRED" } as const;

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `pimisa_${crypto.randomBytes(24).toString("hex")}`;
}

function generateVoucherCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Create Stations ──────────────────────────────────────────
  const station1 = await prisma.station.upsert({
    where: { id: "station-lusaka-01" },
    update: {},
    create: {
      id: "station-lusaka-01",
      stationName: "Pimisa Lusaka Main",
      location: "Cairo Road, Lusaka",
    },
  });

  const station2 = await prisma.station.upsert({
    where: { id: "station-kitwe-01" },
    update: {},
    create: {
      id: "station-kitwe-01",
      stationName: "Pimisa Kitwe Branch",
      location: "Freedom Avenue, Kitwe",
    },
  });

  const station3 = await prisma.station.upsert({
    where: { id: "station-ndola-01" },
    update: {},
    create: {
      id: "station-ndola-01",
      stationName: "Pimisa Ndola Branch",
      location: "Broadway, Ndola",
    },
  });

  console.log("✅ Stations:", station1.stationName, "|", station2.stationName, "|", station3.stationName);

  // ─── Create Admin User ────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@pimisa.com" },
    update: {},
    create: {
      name: "System Administrator",
      email: "admin@pimisa.com",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log("✅ Admin:  ", admin.email);

  // ─── Create Station Users ────────────────────────────────────
  const stationPasswordHash = await bcrypt.hash("Station@123", 12);

  const stationUsers = await Promise.all([
    prisma.user.upsert({
      where: { email: "lusaka@pimisa.com" },
      update: {},
      create: {
        name: "Lusaka Station Attendant",
        email: "lusaka@pimisa.com",
        passwordHash: stationPasswordHash,
        role: UserRole.STATION,
        stationId: station1.id,
      },
    }),
    prisma.user.upsert({
      where: { email: "kitwe@pimisa.com" },
      update: {},
      create: {
        name: "Kitwe Station Attendant",
        email: "kitwe@pimisa.com",
        passwordHash: stationPasswordHash,
        role: UserRole.STATION,
        stationId: station2.id,
      },
    }),
    prisma.user.upsert({
      where: { email: "ndola@pimisa.com" },
      update: {},
      create: {
        name: "Ndola Station Attendant",
        email: "ndola@pimisa.com",
        passwordHash: stationPasswordHash,
        role: UserRole.STATION,
        stationId: station3.id,
      },
    }),
  ]);
  console.log("✅ Station users:", stationUsers.map(u => u.email).join(", "));

  // ─── Create Sample Machines (IoT Dispensers) ─────────────────
  const machines: Array<{ deviceId: string; name: string; stationId: string; location: string; plainKey: string }> = [];

  const machineConfigs = [
    { deviceId: "DISP-LSK-001", name: "Lusaka Dispenser 1", stationId: station1.id, location: "Cairo Road" },
    { deviceId: "DISP-LSK-002", name: "Lusaka Dispenser 2", stationId: station1.id, location: "Great East Road" },
    { deviceId: "DISP-KTW-001", name: "Kitwe Dispenser 1", stationId: station2.id, location: "Freedom Avenue" },
    { deviceId: "DISP-NDL-001", name: "Ndola Dispenser 1", stationId: station3.id, location: "Broadway" },
  ];

  for (const cfg of machineConfigs) {
    const plainKey = generateApiKey();
    const apiKeyHash = await bcrypt.hash(plainKey, 10);
    const apiKeySuffix = plainKey.slice(-8);

    await prisma.machine.upsert({
      where: { deviceId: cfg.deviceId },
      update: {},
      create: {
        deviceId: cfg.deviceId,
        name: cfg.name,
        apiKeyHash,
        apiKeySuffix,
        stationId: cfg.stationId,
        location: cfg.location,
        status: MachineStatusEnum.OFFLINE,
        pricePerLitre: 45.0,
        firmwareVersion: "2.1.0",
        heartbeatInterval: 60,
      },
    });

    machines.push({ ...cfg, plainKey });
  }

  console.log("✅ Machines: ", machineConfigs.map(m => m.deviceId).join(", "));

  // ─── Create Sample Vouchers ──────────────────────────────────
  const sampleBeneficiaries = [
    { name: "John Mwanza", phone: "+260971234567" },
    { name: "Grace Banda", phone: "+260972345678" },
    { name: "Peter Tembo", phone: "+260973456789" },
    { name: "Mary Phiri", phone: "+260974567890" },
    { name: "David Zulu", phone: "+260975678901" },
  ];

  const vouchers = [];
  for (const b of sampleBeneficiaries) {
    const code = generateVoucherCode();
    const voucher = await prisma.voucher.create({
      data: {
        name: b.name,
        phone: b.phone,
        amount: 45.0,
        litres: 1.0,
        voucherCode: code,
        status: VoucherStatus.UNUSED,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        stationId: station1.id,
      },
    });
    vouchers.push(voucher);
  }

  console.log("✅ Vouchers: ", vouchers.length, "sample vouchers created");

  // ─── Print Summary ────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🎉 Seeding complete! Login credentials:");
  console.log("═══════════════════════════════════════════════════");
  console.log("Admin:   admin@pimisa.com / Admin@123");
  console.log("Station: lusaka@pimisa.com / Station@123");
  console.log("         kitwe@pimisa.com / Station@123");
  console.log("         ndola@pimisa.com / Station@123");
  console.log("═══════════════════════════════════════════════════");
  console.log("\n🔑 Machine API Keys (save these — shown only once!):");
  console.log("───────────────────────────────────────────────────");
  for (const m of machines) {
    console.log(`  ${m.deviceId}: ${m.plainKey}`);
  }
  console.log("───────────────────────────────────────────────────\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
