/**
 * DEBUG endpoint - temporarily tests fleet queries on Vercel.
 * DELETE THIS FILE after debugging.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Show redacted DATABASE_URL so we can verify Vercel is using the right DB
  const dbUrl = process.env.DATABASE_URL || "NOT SET";
  const atIndex = dbUrl.indexOf("@");
  results.databaseHost = atIndex > 0 ? dbUrl.substring(atIndex + 1, dbUrl.indexOf("/", atIndex)) : "unknown";

  // List actual tables in the database
  try {
    const tables = await prisma.$queryRaw<Array<{tablename: string}>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    results.tables = tables.map((t: { tablename: string }) => t.tablename);
  } catch (e) {
    results.tablesError = e instanceof Error ? e.message : String(e);
  }

  // Check if location_id column exists on machines
  try {
    const cols = await prisma.$queryRaw<Array<{column_name: string}>>`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'machines' AND table_schema = 'public'
      ORDER BY column_name
    `;
    results.machineColumns = cols.map((c: { column_name: string }) => c.column_name);
  } catch (e) {
    results.machineColumnsError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
