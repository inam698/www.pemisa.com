/**
 * Voucher Service
 * Core business logic for voucher generation, verification, and redemption.
 * Follows single-responsibility principle for each operation.
 */

import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { VoucherStatus } from "@/types";
import { generateVoucherCode, generateBatchId } from "@/lib/utils";
import { sendVoucherSms } from "@/services/smsService";
import { sendVoucherEmail } from "@/lib/email";
import { sendVoucherWhatsApp, isWhatsAppEnabled } from "@/lib/whatsapp";
import { logWarn } from "@/lib/logger";

type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
import {
  ParsedCsvRow,
  VoucherGenerationResult,
  VoucherVerifyResponse,
  DashboardMetrics,
} from "@/types";

// ─── Voucher Code Generation ────────────────────────────────────

/**
 * Generates a unique 6-digit voucher code.
 * Checks database to ensure uniqueness, retries up to 10 times.
 */
async function generateUniqueVoucherCode(): Promise<string> {
  const maxRetries = 10;
  const codeLength = parseInt(process.env.VOUCHER_CODE_LENGTH || "6", 10);

  for (let i = 0; i < maxRetries; i++) {
    const code = generateVoucherCode(codeLength);

    // Check uniqueness against existing codes
    const existing = await prisma.voucher.findUnique({
      where: { voucherCode: code },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error(
    "Failed to generate unique voucher code after maximum retries"
  );
}

// ─── Voucher Generation ─────────────────────────────────────────

/**
 * Generates vouchers for validated CSV rows.
 * Ensures one voucher per phone number (checks existing UNUSED vouchers).
 * Sends SMS for each generated voucher.
 *
 * @param validRows - Array of validated beneficiary rows
 * @returns Generation result with counts and batch ID
 */
export async function generateVouchers(
  validRows: ParsedCsvRow[]
): Promise<VoucherGenerationResult> {
  const batchId = generateBatchId();
  const expiryDays = parseInt(process.env.VOUCHER_EXPIRY_DAYS || "7", 10);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

  let totalGenerated = 0;
  let totalSkipped = 0;
  const skippedPhones: string[] = [];

  for (const row of validRows) {
    // Check if phone already has an active (unused) voucher
    const existingVoucher = await prisma.voucher.findFirst({
      where: {
        phone: row.phone,
        status: VoucherStatus.UNUSED,
        expiryDate: { gt: new Date() },
      },
    });

    if (existingVoucher) {
      // Skip: beneficiary already has an active voucher
      totalSkipped++;
      skippedPhones.push(row.phone);
      continue;
    }

    // Generate unique voucher code
    const voucherCode = await generateUniqueVoucherCode();

    // Create voucher record
    const voucher = await prisma.voucher.create({
      data: {
        name: row.name,
        phone: row.phone,
        amount: row.amount,
        voucherCode,
        status: VoucherStatus.UNUSED,
        expiryDate,
        batchId,
      },
    });

    // Send SMS (non-blocking - continue even if SMS fails)
    try {
      await sendVoucherSms(row.phone, row.amount, voucherCode, voucher.id);
    } catch (error) {
      console.error(`SMS failed for ${row.phone}:`, error);
      // Voucher is still created even if SMS fails
    }

    // Send Email (optional)
    if (row.email) {
      try {
        await sendVoucherEmail(row.name, row.email, voucherCode, row.amount, expiryDate);
      } catch (error) {
        logWarn("Voucher email failed", { email: row.email, voucherId: voucher.id });
      }
    }

    // Send WhatsApp (optional, uses phone)
    if (isWhatsAppEnabled()) {
      try {
        await sendVoucherWhatsApp(row.phone, row.name, voucherCode, row.amount, expiryDate);
      } catch (error) {
        logWarn("Voucher WhatsApp failed", { phone: row.phone, voucherId: voucher.id });
      }
    }

    totalGenerated++;
  }

  return {
    totalGenerated,
    totalSkipped,
    skippedPhones,
    batchId,
  };
}

// ─── Voucher Verification ───────────────────────────────────────

/**
 * Verifies a voucher by phone number and code.
 * Performs all validation checks: existence, phone match, status, expiry.
 *
 * @param phone - Beneficiary phone number
 * @param voucherCode - 6-digit voucher code
 * @returns Verification result with voucher details if valid
 */
export async function verifyVoucher(
  phone: string,
  voucherCode: string
): Promise<VoucherVerifyResponse> {
  // Find voucher by code
  const voucher = await prisma.voucher.findUnique({
    where: { voucherCode },
  });

  // Check 1: Voucher exists
  if (!voucher) {
    return {
      valid: false,
      message: "Voucher not found. Please check the code and try again.",
    };
  }

  // Check 2: Phone number matches
  if (voucher.phone !== phone) {
    return {
      valid: false,
      message: "Phone number does not match this voucher.",
    };
  }

  // Check 3: Not already redeemed
  if (voucher.status === VoucherStatus.USED) {
    return {
      valid: false,
      message: "This voucher has already been redeemed.",
    };
  }

  // Check 4: Not expired
  if (voucher.status === VoucherStatus.EXPIRED || voucher.expiryDate < new Date()) {
    // Auto-update status if expired but not yet marked
    if (voucher.status !== VoucherStatus.EXPIRED) {
      await prisma.voucher.update({
        where: { id: voucher.id },
        data: { status: VoucherStatus.EXPIRED },
      });
    }
    return {
      valid: false,
      message: "This voucher has expired.",
    };
  }

  // All checks passed
  return {
    valid: true,
    message: "Voucher is valid and ready to be redeemed.",
    voucher: {
      id: voucher.id,
      name: voucher.name,
      amount: voucher.amount,
      voucherCode: voucher.voucherCode,
      expiryDate: voucher.expiryDate.toISOString(),
    },
  };
}

// ─── Voucher Redemption ─────────────────────────────────────────

/**
 * Redeems a voucher, marking it as used.
 * Uses a transaction to ensure atomicity.
 *
 * @param voucherId - ID of the voucher to redeem
 * @param stationId - ID of the redeeming station
 * @returns Updated voucher record
 */
export async function redeemVoucher(voucherId: string, stationId: string) {
  // Use transaction for atomicity (prevents double-redemption race condition)
  return prisma.$transaction(async (tx: TransactionClient) => {
    // Re-fetch voucher inside transaction with row-level lock intent
    const voucher = await tx.voucher.findUnique({
      where: { id: voucherId },
    });

    if (!voucher) {
      throw new Error("Voucher not found");
    }

    if (voucher.status !== VoucherStatus.UNUSED) {
      throw new Error("Voucher is no longer available for redemption");
    }

    if (voucher.expiryDate < new Date()) {
      await tx.voucher.update({
        where: { id: voucherId },
        data: { status: VoucherStatus.EXPIRED },
      });
      throw new Error("Voucher has expired");
    }

    // Mark voucher as used
    const updatedVoucher = await tx.voucher.update({
      where: { id: voucherId },
      data: {
        status: VoucherStatus.USED,
        stationId,
        redeemedAt: new Date(),
      },
      include: {
        station: true,
      },
    });

    return updatedVoucher;
  });
}

// ─── Expire Stale Vouchers ──────────────────────────────────────

/**
 * Marks all expired vouchers that are still marked as UNUSED.
 * Should be run periodically (e.g., via cron job or on dashboard load).
 */
export async function expireStaleVouchers(): Promise<number> {
  const result = await prisma.voucher.updateMany({
    where: {
      status: VoucherStatus.UNUSED,
      expiryDate: { lt: new Date() },
    },
    data: {
      status: VoucherStatus.EXPIRED,
    },
  });

  return result.count;
}

// ─── Dashboard Metrics ──────────────────────────────────────────

/**
 * Fetches aggregated dashboard metrics.
 * Includes voucher counts by status and recent redemptions.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  // First, expire any stale vouchers
  await expireStaleVouchers();

  // Run count queries in parallel for efficiency
  const [
    totalVouchers,
    redeemedVouchers,
    unusedVouchers,
    expiredVouchers,
    totalAmountResult,
    redeemedAmountResult,
    recentRedemptions,
  ] = await Promise.all([
    prisma.voucher.count(),
    prisma.voucher.count({ where: { status: VoucherStatus.USED } }),
    prisma.voucher.count({ where: { status: VoucherStatus.UNUSED } }),
    prisma.voucher.count({ where: { status: VoucherStatus.EXPIRED } }),
    prisma.voucher.aggregate({ _sum: { amount: true } }),
    prisma.voucher.aggregate({
      _sum: { amount: true },
      where: { status: VoucherStatus.USED },
    }),
    prisma.voucher.findMany({
      where: { status: VoucherStatus.USED },
      orderBy: { redeemedAt: "desc" },
      take: 10,
      include: { station: true },
    }),
  ]);

  return {
    totalVouchers,
    redeemedVouchers,
    unusedVouchers,
    expiredVouchers,
    totalAmount: totalAmountResult._sum.amount || 0,
    redeemedAmount: redeemedAmountResult._sum.amount || 0,
    recentRedemptions: recentRedemptions.map((v: any) => ({
      id: v.id,
      name: v.name,
      phone: v.phone,
      amount: v.amount,
      stationName: v.station?.stationName || "Unknown",
      redeemedAt: v.redeemedAt?.toISOString() || "",
    })),
  };
}

// ─── IoT Device Voucher Verification ────────────────────────────

/**
 * Verifies a voucher from an IoT dispenser machine.
 * Converts amount to litres using the machine's configured price.
 */
export async function verifyVoucherForDevice(
  phone: string,
  voucherCode: string,
  deviceId: string
) {
  const machine = await prisma.machine.findUnique({
    where: { deviceId },
  });

  if (!machine) {
    return { status: "rejected" as const, litres: 0, amount: 0, message: "Unknown device" };
  }

  const result = await verifyVoucher(phone, voucherCode);

  if (!result.valid || !result.voucher) {
    return {
      status: "rejected" as const,
      litres: 0,
      amount: 0,
      message: result.message,
    };
  }

  const litres = result.voucher.amount / machine.pricePerLitre;

  return {
    status: "approved" as const,
    litres: Math.round(litres * 1000) / 1000, // 3 decimal precision
    amount: result.voucher.amount,
    voucher_code: result.voucher.voucherCode,
    beneficiary_name: result.voucher.name,
    message: result.message,
  };
}

// ─── IoT Device Voucher Redemption ──────────────────────────────

/**
 * Redeems a voucher from an IoT dispenser machine after oil dispensing.
 * Records litres dispensed and the device that dispensed.
 */
export async function redeemVoucherFromDevice(
  voucherCode: string,
  deviceId: string,
  litresDispensed: number
) {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const voucher = await tx.voucher.findUnique({
      where: { voucherCode },
    });

    if (!voucher) {
      throw new Error("Voucher not found");
    }

    if (voucher.status !== VoucherStatus.UNUSED) {
      throw new Error("Voucher is no longer available for redemption");
    }

    if (voucher.expiryDate < new Date()) {
      await tx.voucher.update({
        where: { id: voucher.id },
        data: { status: VoucherStatus.EXPIRED },
      });
      throw new Error("Voucher has expired");
    }

    // Validate dispensed amount doesn't exceed voucher allocation (10% tolerance for flow sensor)
    const maxAllowedLitres = voucher.litres * 1.10;
    if (litresDispensed > maxAllowedLitres) {
      throw new Error(
        `Dispensed amount (${litresDispensed.toFixed(2)}L) exceeds voucher allocation (${voucher.litres}L + 10% tolerance)`
      );
    }

    // Find machine to get station assignment
    const machine = await tx.machine.findUnique({
      where: { deviceId },
    });

    const updatedVoucher = await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        status: VoucherStatus.USED,
        stationId: machine?.stationId || null,
        redeemedAt: new Date(),
        litresDispensed,
        dispensedByDevice: deviceId,
      },
    });

    return updatedVoucher;
  });
}
