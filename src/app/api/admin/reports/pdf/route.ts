/**
 * PDF Reports API Route (Legacy)
 * GET: Download reports as PDF
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { generateVouchersPDF, generateStationReportPDF } from "@/lib/pdf";
import { logApiError, logInfo } from "@/lib/logger";
import { VoucherStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload || payload.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("report") || "vouchers";
    const status = searchParams.get("status");

    let pdfBuffer: Buffer;
    let fileName: string;

    if (reportType === "vouchers") {
      const vouchers = await prisma.voucher.findMany({
        ...(status && status !== "ALL" ? { where: { status: status as VoucherStatus } } : {}),
        include: { station: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      pdfBuffer = await generateVouchersPDF(vouchers);
      fileName = `vouchers-report-${new Date().toISOString().split("T")[0]}.pdf`;

      logInfo("Legacy vouchers PDF generated", {
        userId: payload.userId,
        count: vouchers.length,
        status,
      });
    } else if (reportType === "stations") {
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
      fileName = `stations-report-${new Date().toISOString().split("T")[0]}.pdf`;

      logInfo("Legacy stations PDF generated", {
        userId: payload.userId,
        count: stations.length,
      });
    } else {
      return NextResponse.json({ success: false, error: "Invalid report type" }, { status: 400 });
    }

    return new NextResponse(Uint8Array.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    logApiError("/api/admin/reports/pdf", error as Error);
    return NextResponse.json({ success: false, error: "Report generation failed" }, { status: 500 });
  }
}
