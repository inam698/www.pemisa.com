/**
 * GET /api/v1/organizations/[id]
 * Get organization details (SUPER_ADMIN only)
 * 
 * PATCH /api/v1/organizations/[id]
 * Update organization (SUPER_ADMIN only)
 * 
 * DELETE /api/v1/organizations/[id]
 * Deactivate organization (SUPER_ADMIN only)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { withSuperAdmin } from "@/middleware/authMiddleware";
import { JwtPayload } from "@/types";
import { z } from "zod";

const updateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  isActive: z.boolean().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  maxStations: z.number().int().min(1).max(1000).optional(),
  maxMachines: z.number().int().min(1).max(10000).optional(),
  maxUsersPerOrg: z.number().int().min(1).max(500).optional(),
  logo: z.string().url().optional(),
});

// GET — Get organization details
export const GET = withSuperAdmin(
  async (
    _request: NextRequest,
    _user: JwtPayload,
  ) => {
    // Extract id from URL
    const url = new URL(_request.url);
    const id = url.pathname.split("/").pop();

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            stations: true,
            machines: true,
            vouchers: true,
          },
        },
        stations: { select: { id: true, stationName: true, location: true } },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: organization });
  }
);

// PATCH — Update organization
export const PATCH = withSuperAdmin(
  async (request: NextRequest, _user: JwtPayload) => {
    const url = new URL(request.url);
    const id = url.pathname.split("/").pop();

    const body = await request.json();
    const validation = updateOrgSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({ success: true, data: organization });
  }
);

// DELETE — Deactivate organization (soft delete)
export const DELETE = withSuperAdmin(
  async (request: NextRequest, _user: JwtPayload) => {
    const url = new URL(request.url);
    const id = url.pathname.split("/").pop();

    const existing = await prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // Soft delete — deactivate instead of destroying data
    await prisma.organization.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: "Organization deactivated",
    });
  }
);
