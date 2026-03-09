import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("1. Testing locations query...");
    const locations = await prisma.location.findMany({
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
    });
    console.log(`   OK: ${locations.length} locations found`);

    console.log("2. Testing machines query...");
    const machines = await prisma.machine.findMany({
      select: { id: true, status: true, oilRemainingLitres: true, oilCapacityLitres: true },
    });
    console.log(`   OK: ${machines.length} machines found`);

    console.log("3. Testing pricing rules query...");
    const rules = await prisma.pricingRule.findMany({
      include: { machine: { select: { deviceId: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    console.log(`   OK: ${rules.length} pricing rules found`);

    console.log("4. Testing getMachines (with station relation)...");
    const machinesWithStation = await prisma.machine.findMany({
      include: {
        station: { select: { stationName: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    console.log(`   OK: ${machinesWithStation.length} machines with station`);

    console.log("\nAll queries passed!");
  } catch (error) {
    console.error("QUERY FAILED:", error.message);
    console.error("Full error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
