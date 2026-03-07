/**
 * PDF Export API
 * Generate PDF reports for vouchers and stations
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/middleware/authMiddleware";
import prisma from "@/lib/db/prisma";
import { generateVouchersPDF, generateStationReportPDF } from "@/lib/pdf";
import { logApiError, logInfo } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyFirebaseIdToken(token);
    if (!payload || payload.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "vouchers";
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let pdfBuffer: Buffer;
    let filename: string;

    if (type === "vouchers") {
      // Fetch vouchers with filters
      const where: any = {};
      if(status && status !== "ALL") where.status = status;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }

      const vouchers = await prisma.voucher.findMany({
        where,
        include: { station: true },
        orderBy: { createdAt: "desc" },
        take: 1000, // Limit for performance
      });

      pdfBuffer = await generateVouchersPDF(vouchers);
      filename = `vouchers-${new Date().toISOString().split("T")[0]}.pdf`;

      logInfo("Vouchers PDF generated", {
        userId: payload.userId,
        count: vouchers.length,
        filters: { status, from, to },
      });
    } else if (type === "stations") {
      const stations = await prisma.station.findMany({
        include: {
          vouchers: {
            select: { status: true, amount: true },
          },
        },
      });

      const stationData = stations.map((s) => ({
        id: s.id,
        stationName: s.stationName,
        location: s.location,
        totalVouchers: s.vouchers.length,
        redeemed: s.vouchers.filter((v) => v.status === "USED").length,
        totalAmount: s.vouchers
          .filter((v) => v.status === "USED")
          .reduce((sum, v) => sum + v.amount, 0),
      }));

      pdfBuffer = await generateStationReportPDF(stationData);
      filename = `stations-${new Date().toISOString().split("T")[0]}.pdf`;

      logInfo("Stations PDF generated", {
        userId: payload.userId,
        count: stations.length,
      });
    } else {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    return new NextResponse(Uint8Array.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logApiError("/api/admin/export/pdf", error as Error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
