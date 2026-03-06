/**
 * CSV Parser Service
 * Parses and validates CSV files containing beneficiary data.
 * Validates each row against defined rules and separates valid/invalid rows.
 */

import Papa from "papaparse";
import {
  CsvRow,
  CsvValidationResult,
  ParsedCsvRow,
  RejectedRow,
} from "@/types";
import {
  isValidZambianPhone,
  normalizePhoneNumber,
  sanitizeString,
  parseAmount,
} from "@/lib/utils";

/**
 * Parses raw CSV text into structured and validated rows.
 * Handles column name normalization (case-insensitive, trimmed).
 *
 * @param csvText - Raw CSV string content
 * @returns Validation result with valid and rejected rows
 */
export function parseCsv(csvText: string): CsvValidationResult {
  const validRows: ParsedCsvRow[] = [];
  const rejectedRows: RejectedRow[] = [];

  // Parse CSV using PapaParse with header detection
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });

  // Check for parsing errors
  if (result.errors.length > 0) {
    console.warn("CSV Parse warnings:", result.errors);
  }

  const rows = result.data;
  const totalRows = rows.length;

  // Track phone numbers to prevent duplicates within the same upload
  const seenPhones = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because index 0 = row 2 (row 1 is header)

    // Normalize column names (handle various common names)
    const rawName = row["name"] || row["beneficiary"] || row["full_name"] || "";
    const rawPhone =
      row["phone"] ||
      row["phone_number"] ||
      row["phonenumber"] ||
      row["mobile"] ||
      row["telephone"] ||
      "";
    const rawEmail =
      row["email"] ||
      row["email_address"] ||
      row["e-mail"] ||
      "";
    const rawAmount =
      row["voucheramount"] ||
      row["voucher_amount"] ||
      row["amount"] ||
      row["value"] ||
      "";

    // ─── Validation Rules ─────────────────────────────────────
    const errors: string[] = [];

    // Rule 1: Name is required
    const name = sanitizeString(rawName);
    if (!name) {
      errors.push("Missing name");
    }

    // Rule 2: Phone number must be valid
    const phone = rawPhone.trim();
    if (!phone) {
      errors.push("Missing phone number");
    } else if (!isValidZambianPhone(phone)) {
      errors.push("Invalid phone number");
    }

    // Rule 3: Amount must be present and numeric
    const amount = parseAmount(rawAmount);
    if (!rawAmount) {
      errors.push("Missing voucher amount");
    } else if (amount === null) {
      errors.push("Non-numeric voucher amount");
    }

    // Rule 4: Email is optional but must be valid if provided
    const email = rawEmail.trim();
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push("Invalid email format");
      }
    }

    // Rule 5: No duplicate phone numbers in the same upload
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : "";
    if (normalizedPhone && seenPhones.has(normalizedPhone)) {
      errors.push("Duplicate phone number in this upload");
    }

    // ─── Result Classification ────────────────────────────────
    if (errors.length > 0) {
      rejectedRows.push({
        rowNumber,
        name: rawName || undefined,
        phone: rawPhone || undefined,
        email: rawEmail || undefined,
        voucherAmount: rawAmount || undefined,
        reason: errors.join("; "),
      });
    } else {
      seenPhones.add(normalizedPhone);
      validRows.push({
        name,
        phone: normalizedPhone,
        email: email || undefined,
        amount: amount!,
        rowNumber,
      });
    }
  });

  return {
    validRows,
    rejectedRows,
    totalRows,
  };
}

/**
 * Generates a CSV string from rejected rows for download.
 * Includes the original data plus the rejection reason.
 */
export function generateRejectedCsv(rejectedRows: RejectedRow[]): string {
  const headers = ["Row", "Name", "Phone", "Email", "VoucherAmount", "Reason"];
  const rows = rejectedRows.map((r) => [
    r.rowNumber.toString(),
    r.name || "",
    r.phone || "",
    r.email || "",
    r.voucherAmount?.toString() || "",
    r.reason,
  ]);

  return Papa.unparse({
    fields: headers,
    data: rows,
  });
}
