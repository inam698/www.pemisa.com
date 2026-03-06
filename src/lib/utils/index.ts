/**
 * Utility Functions
 * Common utility functions used across the application.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes with conflict resolution.
 * Combines clsx for conditional classes with tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a unique numeric voucher code of specified length.
 * Uses cryptographically random values for security.
 */
export function generateVoucherCode(length: number = 6): string {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let code = "";
  // Ensure first digit is not 0 for readability
  code += String((array[0] % 9) + 1);
  for (let i = 1; i < length; i++) {
    code += String(array[i] % 10);
  }
  return code;
}

/**
 * Normalizes a Zambian phone number to E.164 format (+260XXXXXXXXX).
 * Handles common input formats: 0XX, +260XX, 260XX.
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Remove leading +
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Handle Zambian formats
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    // Local format: 0977XXXXXX → 260977XXXXXX
    cleaned = "260" + cleaned.substring(1);
  } else if (cleaned.startsWith("260") && cleaned.length === 12) {
    // Already in international format without +
  } else if (cleaned.length === 9 && !cleaned.startsWith("0")) {
    // Short format without country code: 977XXXXXX
    cleaned = "260" + cleaned;
  }

  return "+" + cleaned;
}

/**
 * Validates a Zambian phone number.
 * Accepts formats: +260XXXXXXXXX, 260XXXXXXXXX, 0XXXXXXXXX
 */
export function isValidZambianPhone(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Zambian numbers: +260 followed by 9 digits
  return /^\+260\d{9}$/.test(normalized);
}

/**
 * Formats a currency amount in Zambian Kwacha.
 */
export function formatCurrency(amount: number): string {
  return `K${amount.toFixed(2)}`;
}

/**
 * Formats a date to a human-readable string.
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-ZM", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Masks a phone number for display (e.g., +260***XXX789).
 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  const visible = phone.slice(-3);
  const prefix = phone.slice(0, 4);
  return `${prefix}***${visible}`;
}

/**
 * Generates a unique batch ID for voucher generation batches.
 */
export function generateBatchId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `batch_${timestamp}_${random}`;
}

/**
 * Safely parses a numeric value from string input.
 */
export function parseAmount(value: string | number): number | null {
  if (typeof value === "number") return value > 0 ? value : null;
  const parsed = parseFloat(value);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Sanitizes a string input by trimming and removing dangerous characters.
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove angle brackets (basic XSS prevention)
    .replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters
}
