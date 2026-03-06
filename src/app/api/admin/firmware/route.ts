/**
 * Admin OTA Firmware Management
 * POST /api/admin/firmware - upload firmware release metadata
 * POST /api/admin/firmware/push - push OTA update to fleet
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { firmwareReleaseSchema, otaPushSchema } from "@/lib/validators";
import { pushOtaUpdate } from "@/services/machineService";
import prisma from "@/lib/db/prisma";
import { JwtPayload } from "@/types";

// ─── GET: List firmware releases ────────────────────────────────

async function getHandler(request: NextRequest, user: JwtPayload) {
  try {
    const releases = await prisma.firmwareRelease.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: releases });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}

// ─── POST: Create firmware release or push OTA ──────────────────

async function postHandler(request: NextRequest, user: JwtPayload) {
  try {
    const body = await request.json();

    // Push OTA to fleet
    if (body.action === "push") {
      const validation = otaPushSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: validation.error.errors[0].message },
          { status: 400 }
        );
      }

      const count = await pushOtaUpdate(validation.data);
      return NextResponse.json({
        success: true,
        message: `OTA update pushed to ${count} machine(s)`,
        machinesUpdated: count,
      });
    }

    // Create firmware release
    const validation = firmwareReleaseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const release = await prisma.firmwareRelease.create({
      data: validation.data,
    });

    return NextResponse.json({
      success: true,
      data: release,
      message: "Firmware release created",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(getHandler);
export const POST = withAdmin(postHandler);
