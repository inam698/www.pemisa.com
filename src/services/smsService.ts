/**
 * SMS Service
 * Handles sending SMS messages to beneficiaries.
 * Supports Africa's Talking and Twilio as providers.
 * Falls back to console logging in development/sandbox mode.
 */

import prisma from "@/lib/db/prisma";
import { SmsStatus } from "@/types";

// ─── SMS Provider Interface ─────────────────────────────────────

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── SMS Message Builder ────────────────────────────────────────

/**
 * Builds the voucher SMS message body.
 */
export function buildVoucherSms(
  amount: number,
  voucherCode: string,
  expiryDays: number = 7
): string {
  return [
    "Pimisa Oil Voucher",
    "",
    `Amount: K${amount.toFixed(0)}`,
    `Voucher Code: ${voucherCode}`,
    "",
    `Present this code at any Pimisa station within ${expiryDays} days.`,
  ].join("\n");
}

// ─── Africa's Talking Provider ──────────────────────────────────

async function sendViaAfricasTalking(
  phone: string,
  message: string
): Promise<SmsResult> {
  try {
    const AfricasTalking = (await import("africastalking")).default;
    const at = AfricasTalking({
      apiKey: process.env.AT_API_KEY!,
      username: process.env.AT_USERNAME!,
    });

    const sms = at.SMS;
    const result = await sms.send({
      to: [phone],
      message,
      from: process.env.AT_SENDER_ID || undefined,
    });

    const recipients = result.SMSMessageData?.Recipients || [];
    if (recipients.length > 0 && recipients[0].status === "Success") {
      return { success: true, messageId: recipients[0].messageId };
    }

    return {
      success: false,
      error: recipients[0]?.status || "Unknown error from Africa's Talking",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Development/Sandbox Mode ───────────────────────────────────

async function sendViaSandbox(
  phone: string,
  message: string
): Promise<SmsResult> {
  // In sandbox mode, log the SMS instead of sending
  console.log("═══════════════════════════════════════");
  console.log("📱 SMS (Sandbox Mode)");
  console.log(`   To: ${phone}`);
  console.log(`   Message:\n${message}`);
  console.log("═══════════════════════════════════════");

  // Simulate small delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  return { success: true, messageId: `sandbox_${Date.now()}` };
}

// ─── Main Send Function ─────────────────────────────────────────

/**
 * Sends an SMS message and logs the result.
 * Automatically selects the configured provider.
 *
 * @param phone - Recipient phone number (E.164 format)
 * @param message - SMS message body
 * @param voucherId - Optional voucher ID for log association
 * @returns SMS delivery result
 */
export async function sendSms(
  phone: string,
  message: string,
  voucherId?: string
): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER || "sandbox";

  // Create initial SMS log entry
  const smsLog = await prisma.smsLog.create({
    data: {
      phone,
      message,
      status: SmsStatus.PENDING,
      provider,
      voucherId: voucherId || null,
    },
  });

  let result: SmsResult;

  // Route to appropriate provider
  switch (provider) {
    case "africastalking":
      // Only use real AT API if not in sandbox username
      if (process.env.AT_USERNAME === "sandbox") {
        result = await sendViaSandbox(phone, message);
      } else {
        result = await sendViaAfricasTalking(phone, message);
      }
      break;
    default:
      result = await sendViaSandbox(phone, message);
  }

  // Update SMS log with result
  await prisma.smsLog.update({
    where: { id: smsLog.id },
    data: {
      status: result.success ? SmsStatus.SENT : SmsStatus.FAILED,
      sentAt: result.success ? new Date() : null,
    },
  });

  return result;
}

/**
 * Sends voucher SMS to a beneficiary.
 * Convenience wrapper that builds the message and sends it.
 */
export async function sendVoucherSms(
  phone: string,
  amount: number,
  voucherCode: string,
  voucherId: string
): Promise<SmsResult> {
  const expiryDays = parseInt(process.env.VOUCHER_EXPIRY_DAYS || "7", 10);
  const message = buildVoucherSms(amount, voucherCode, expiryDays);
  return sendSms(phone, message, voucherId);
}
