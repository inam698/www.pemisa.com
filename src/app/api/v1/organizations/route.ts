/**
 * GET /api/v1/organizations
 * List all organizations (SUPER_ADMIN only)
 * 
 * POST /api/v1/organizations
 * Create a new organization (SUPER_ADMIN only)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { withSuperAdmin } from "@/middleware/authMiddleware";
import { JwtPayload } from "@/types";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens only"),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]).default("STARTER"),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  maxStations: z.number().int().min(1).max(1000).default(5),
  maxMachines: z.number().int().min(1).max(10000).default(20),
  maxUsersPerOrg: z.number().int().min(1).max(500).default(10),
});

// GET — List all organizations
export const GET = withSuperAdmin(
  async (_request: NextRequest, _user: JwtPayload) => {
    const organizations = await prisma.organization.findMany({
      include: {
        _count: {
          select: {
            users: true,
            stations: true,
            machines: true,
            vouchers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: organizations,
    });
  }
);

// POST — Create a new organization
export const POST = withSuperAdmin(
  async (request: NextRequest, _user: JwtPayload) => {
    const body = await request.json();
    const validation = createOrgSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check slug uniqueness
    const existing = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Organization slug already taken" },
        { status: 409 }
      );
    }

    const organization = await prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        plan: data.plan,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        maxStations: data.maxStations,
        maxMachines: data.maxMachines,
        maxUsersPerOrg: data.maxUsersPerOrg,
      },
    });

    return NextResponse.json(
      { success: true, data: organization },
      { status: 201 }
    );
  }
);
