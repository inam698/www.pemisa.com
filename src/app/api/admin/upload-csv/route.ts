/**
 * POST /api/admin/upload-csv
 * Handles CSV file upload and validation.
 * Returns parsed valid rows and rejected rows with reasons.
 * Admin-only endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import { parseCsv, generateRejectedCsv } from "@/services/csvParser";
import { JwtPayload } from "@/types";

async function uploadCsvHandler(
  request: NextRequest,
  _user: JwtPayload
) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No CSV file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !file.name.endsWith(".csv") &&
      file.type !== "text/csv" &&
      file.type !== "application/vnd.ms-excel"
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Please upload a CSV file." },
        { status: 400 }
      );
    }

    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();

    if (!csvText.trim()) {
      return NextResponse.json(
        { success: false, error: "CSV file is empty" },
        { status: 400 }
      );
    }

    // Parse and validate CSV
    const result = parseCsv(csvText);

    // Generate rejected rows CSV for download
    const rejectedCsv =
      result.rejectedRows.length > 0
        ? generateRejectedCsv(result.rejectedRows)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        totalRows: result.totalRows,
        validCount: result.validRows.length,
        rejectedCount: result.rejectedRows.length,
        validRows: result.validRows,
        rejectedRows: result.rejectedRows,
        rejectedCsv,
      },
    });
  } catch (error) {
    console.error("CSV upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process CSV file" },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(uploadCsvHandler);
