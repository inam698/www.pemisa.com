/**
 * DEBUG endpoint - temporarily tests fleet queries on Vercel.
 * DELETE THIS FILE after debugging.
 */
import { NextResponse } from "next/server";
import { getFleetOverview } from "@/services/locationService";
import { getAllPricingRules } from "@/services/pricingService";
import { getMachines } from "@/services/machineService";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    results.overview = await getFleetOverview();
    results.overviewOk = true;
  } catch (e) {
    results.overviewOk = false;
    results.overviewError = e instanceof Error ? e.message : String(e);
    results.overviewStack = e instanceof Error ? e.stack : undefined;
  }

  try {
    results.pricing = await getAllPricingRules();
    results.pricingOk = true;
  } catch (e) {
    results.pricingOk = false;
    results.pricingError = e instanceof Error ? e.message : String(e);
  }

  try {
    results.machines = await getMachines({ page: 1, pageSize: 5 });
    results.machinesOk = true;
  } catch (e) {
    results.machinesOk = false;
    results.machinesError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
