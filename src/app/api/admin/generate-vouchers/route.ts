/**
 * POST /api/admin/generate-vouchers
 * Generates vouchers for validated CSV rows.
 * Expects an array of valid rows from the CSV upload step.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { generateVouchers } from "@/services/voucherService";
import { JwtPayload, ParsedCsvRow } from "@/types";

async function generateVouchersHandler(
  request: NextRequest,
  _user: JwtPayload
) {
  try {
    const body = await request.json();

    // Validate input
    if (!body.validRows || !Array.isArray(body.validRows)) {
      return NextResponse.json(
        { success: false, error: "Invalid request. Expected validRows array." },
        { status: 400 }
      );
    }

    if (body.validRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid rows to generate vouchers from." },
        { status: 400 }
      );
    }

    // Validate each row has required fields
    const validRows: ParsedCsvRow[] = body.validRows.map(
      (row: ParsedCsvRow, index: number) => {
        if (!row.name || !row.phone || !row.amount) {
          throw new Error(
            `Invalid row at index ${index}: missing required fields`
          );
        }
        return {
          name: row.name,
          phone: row.phone,
          email: row.email || undefined,
          amount: Number(row.amount),
          rowNumber: row.rowNumber || index + 1,
        };
      }
    );

    // Generate vouchers and send SMS
    const result = await generateVouchers(validRows);

    return NextResponse.json({
      success: true,
      data: {
        totalGenerated: result.totalGenerated,
        totalSkipped: result.totalSkipped,
        skippedPhones: result.skippedPhones,
        batchId: result.batchId,
        message: `Successfully generated ${result.totalGenerated} vouchers. ${
          result.totalSkipped > 0
            ? `${result.totalSkipped} skipped (active voucher exists).`
            : ""
        }`,
      },
    });
  } catch (error) {
    console.error("Voucher generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate vouchers";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(generateVouchersHandler);
