/**
 * WhatsApp Service (Meta Cloud API)
 * Sends voucher notifications via WhatsApp
 */

import { logError, logInfo } from "@/lib/logger";

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v19.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true" && !!WHATSAPP_TOKEN && !!WHATSAPP_PHONE_NUMBER_ID;
}

export async function sendVoucherWhatsApp(
  phone: string,
  name: string,
  voucherCode: string,
  amount: number,
  expiryDate: Date
) {
  if (!isWhatsAppEnabled()) {
    return { success: false, message: "WhatsApp not configured" };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const text = `Hello ${name}, your Pimisa voucher code is ${voucherCode}. Amount: K${amount}. Expires: ${expiryDate.toLocaleDateString()}. Keep this code safe.`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError("WhatsApp send failed", { status: response.status, errorBody });
      return { success: false, message: "WhatsApp send failed" };
    }

    logInfo("WhatsApp voucher sent", { phone, voucherCode });
    return { success: true };
  } catch (error) {
    logError("WhatsApp send error", { error: error instanceof Error ? error.message : String(error) });
    return { success: false, message: "WhatsApp send error" };
  }
}
