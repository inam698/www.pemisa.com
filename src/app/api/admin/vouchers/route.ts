/**
 * GET /api/admin/vouchers
 * Returns paginated, filterable voucher list.
 * Supports search by name/phone and filter by status.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import prisma from "@/lib/db/prisma";
import { voucherQuerySchema } from "@/lib/validators";
import { JwtPayload, VoucherTableRow, VoucherStatus } from "@/types";
import { expireStaleVouchers } from "@/services/voucherService";

async function vouchersHandler(
  request: NextRequest,
  _user: JwtPayload
) {
  try {
    // Parse query parameters from URL
    const { searchParams } = new URL(request.url);
    const queryParams = {
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "20",
      status: searchParams.get("status") || "ALL",
      search: searchParams.get("search") || undefined,
      batchId: searchParams.get("batchId") || undefined,
    };

    const validation = voucherQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, pageSize, status, search, batchId } = validation.data;

    // Expire stale vouchers before listing
    await expireStaleVouchers();

    // Build Prisma where clause
    const where: Record<string, unknown> = {};

    if (status !== "ALL") {
      where.status = status as VoucherStatus;
    }

    if (batchId) {
      where.batchId = batchId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { voucherCode: { contains: search } },
      ];
    }

    // Fetch vouchers with pagination
    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: { station: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.voucher.count({ where }),
    ]);

    // Transform to table format
    const data: VoucherTableRow[] = vouchers.map((v: any) => ({
      id: v.id,
      name: v.name,
      phone: v.phone,
      amount: v.amount,
      voucherCode: v.voucherCode,
      status: v.status,
      stationName: v.station?.stationName || null,
      redeemedAt: v.redeemedAt?.toISOString() || null,
      expiryDate: v.expiryDate.toISOString(),
      createdAt: v.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Vouchers list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vouchers" },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(vouchersHandler);
