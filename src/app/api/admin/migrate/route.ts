/**
 * POST /api/admin/migrate — Temporary endpoint to run schema migrations
 * Remove after use.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  // Simple auth check — require a secret header
  const secret = request.headers.get("x-migrate-secret");
  if (secret !== process.env.JWT_SECRET?.substring(0, 20)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  try {
    // Add missing organization_id columns and create organizations table
    const migrations = [
      // Create organizations table
      `CREATE TABLE IF NOT EXISTS "organizations" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "logo" TEXT,
        "plan" TEXT NOT NULL DEFAULT 'STARTER',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "max_stations" INTEGER NOT NULL DEFAULT 5,
        "max_machines" INTEGER NOT NULL DEFAULT 20,
        "max_users_per_org" INTEGER NOT NULL DEFAULT 10,
        "contact_email" TEXT,
        "contact_phone" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug")`,

      // Add organization_id to users
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" TEXT`,
      `CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users"("organization_id")`,

      // Add organization_id to stations
      `ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "organization_id" TEXT`,
      `CREATE INDEX IF NOT EXISTS "stations_organization_id_idx" ON "stations"("organization_id")`,

      // Add organization_id to vouchers
      `ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "organization_id" TEXT`,
      `CREATE INDEX IF NOT EXISTS "vouchers_organization_id_idx" ON "vouchers"("organization_id")`,

      // Add organization_id to machines
      `ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT`,
      `CREATE INDEX IF NOT EXISTS "machines_organization_id_idx" ON "machines"("organization_id")`,

      // Add organization_id to audit_logs
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT`,
      `CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs"("organization_id")`,

      // Add 2FA columns to users
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" TEXT`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "backup_codes" TEXT`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false`,
    ];

    for (const sql of migrations) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push(`OK: ${sql.substring(0, 60)}...`);
      } catch (err: any) {
        results.push(`SKIP: ${sql.substring(0, 60)}... (${err.message?.substring(0, 80)})`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
