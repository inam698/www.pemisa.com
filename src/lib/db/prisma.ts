/**
 * Prisma Client Singleton
 * Prevents multiple Prisma Client instances in development (hot reload).
 * Uses global singleton pattern recommended by Prisma.
 *
 * SCALABILITY: Connection pool sized for 1000+ concurrent IoT devices.
 * PostgreSQL connection_limit should match: pool_size × app_replicas.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Connection pool tuning for high-throughput IoT workload:
// - 1000 devices sending heartbeats every 60s = ~17 req/s
// - Plus sales, voucher verify/redeem = ~50-100 req/s peak
// - Pool size 20 is optimal for PostgreSQL (recommended: connections ≤ 2× CPU cores)
const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || "20", 10);
const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT || "10", 10);

// Append pool params to DATABASE_URL if not already present
function getDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";
  if (baseUrl.includes("connection_limit") || baseUrl.includes("sqlite")) {
    return baseUrl;
  }
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}connection_limit=${poolSize}&pool_timeout=${poolTimeout}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDatabaseUrl(),
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
