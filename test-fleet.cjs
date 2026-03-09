const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function test() {
  try {
    const locs = await p.location.count();
    console.log('Locations:', locs);
    
    const machines = await p.machine.count();
    console.log('Machines:', machines);
    
    const rules = await p.pricingRule.count();
    console.log('PricingRules:', rules);
    
    // Test the exact getFleetOverview query
    const locations = await p.location.findMany({
      include: {
        machines: {
          select: {
            id: true, deviceId: true, name: true, status: true,
            oilRemainingLitres: true, oilCapacityLitres: true,
            pricePerLitre: true, lastSeen: true, firmwareVersion: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    console.log('Fleet locations with machines:', JSON.stringify(locations, null, 2).substring(0, 500));
    
    console.log('\nAll queries PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error(err);
  } finally {
    await p.$disconnect();
  }
}
test();
