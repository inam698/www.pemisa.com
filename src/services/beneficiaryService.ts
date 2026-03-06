/**
 * Beneficiary Service
 * Lookup beneficiary voucher history and manage SMS resend.
 */

import prisma from "@/lib/db/prisma";
import { sendVoucherSms } from "@/services/smsService";

/**
 * Look up all vouchers for a given phone number.
 */
export async function lookupBeneficiary(phone: string) {
  const vouchers = await prisma.voucher.findMany({
    where: { phone },
    include: { station: true, smsLogs: true },
    orderBy: { createdAt: "desc" },
  });

  return vouchers.map((v: any) => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    amount: v.amount,
    voucherCode: v.voucherCode,
    status: v.status,
    batchId: v.batchId,
    stationName: v.station?.stationName || null,
    redeemedAt: v.redeemedAt?.toISOString() || null,
    expiryDate: v.expiryDate.toISOString(),
    createdAt: v.createdAt.toISOString(),
    smsLogs: v.smsLogs.map((s: any) => ({
      id: s.id,
      status: s.status,
      sentAt: s.sentAt?.toISOString() || null,
      createdAt: s.createdAt.toISOString(),
    })),
  }));
}

/**
 * Resend voucher SMS for a specific voucher.
 */
export async function resendVoucherSms(voucherId: string) {
  const voucher = await prisma.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw new Error("Voucher not found");
  if (voucher.status !== "UNUSED") throw new Error("Can only resend SMS for unused vouchers");

  const result = await sendVoucherSms(
    voucher.phone,
    voucher.amount,
    voucher.voucherCode,
    voucher.id
  );

  return result;
}
