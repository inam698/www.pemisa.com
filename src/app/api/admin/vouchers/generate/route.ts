/**
 * POST /api/admin/vouchers/generate
 * Generates a single voucher for a beneficiary.
 * Admin enters name, phone, amount → gets a numeric voucher code.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/middleware/authMiddleware";
import prisma from "@/lib/db/prisma";
import { JwtPayload, VoucherStatus } from "@/types";
import { generateVoucherCode, generateBatchId, normalizePhoneNumber, isValidZambianPhone } from "@/lib/utils";
import { z } from "zod";

const singleVoucherSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().min(9, "Valid phone number required"),
  amount: z.number().positive("Amount must be positive"),
});

async function generateHandler(
  request: NextRequest,
  user: JwtPayload
) {
  try {
    const body = await request.json();
    const validation = singleVoucherSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, amount } = validation.data;
    const phone = normalizePhoneNumber(validation.data.phone);

    if (!isValidZambianPhone(phone)) {
      return NextResponse.json(
        { success: false, error: "Invalid Zambian phone number" },
        { status: 400 }
      );
    }

    // Check for existing active voucher on this phone
    const existing = await prisma.voucher.findFirst({
      where: {
        phone,
        status: VoucherStatus.UNUSED,
        expiryDate: { gt: new Date() },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `This phone already has an active voucher (code: ${existing.voucherCode})` },
        { status: 409 }
      );
    }

    // Generate unique numeric code
    const codeLength = parseInt(process.env.VOUCHER_CODE_LENGTH || "6", 10);
    let voucherCode = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      voucherCode = generateVoucherCode(codeLength);
      const dup = await prisma.voucher.findUnique({ where: { voucherCode } });
      if (!dup) break;
      if (attempt === 9) {
        return NextResponse.json(
          { success: false, error: "Failed to generate unique code. Try again." },
          { status: 500 }
        );
      }
    }

    const expiryDays = parseInt(process.env.VOUCHER_EXPIRY_DAYS || "7", 10);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const voucher = await prisma.voucher.create({
      data: {
        name,
        phone,
        amount,
        voucherCode,
        status: VoucherStatus.UNUSED,
        expiryDate,
        batchId: generateBatchId(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: voucher.id,
        voucherCode: voucher.voucherCode,
        name: voucher.name,
        phone: voucher.phone,
        amount: voucher.amount,
        expiryDate: voucher.expiryDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("Single voucher generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate voucher" },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(generateHandler);
