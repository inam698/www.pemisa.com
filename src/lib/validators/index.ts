/**
 * Zod Validation Schemas
 * Centralized validation schemas for all API inputs.
 */

import { z } from "zod";

// ─── Authentication ─────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email too long")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password too long"),
});

// ─── CSV Row Validation ─────────────────────────────────────────

export const csvRowSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name too long")
    .transform((v) => v.trim()),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .max(20, "Phone number too long")
    .transform((v) => v.trim()),
  voucherAmount: z.union([
    z.number().positive("Amount must be positive"),
    z
      .string()
      .min(1, "Amount is required")
      .transform((v) => {
        const num = parseFloat(v);
        if (isNaN(num) || num <= 0) throw new Error("Invalid amount");
        return num;
      }),
  ]),
});

// ─── Voucher Verification ───────────────────────────────────────

export const voucherVerifySchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .max(20, "Phone number too long")
    .transform((v) => v.trim()),
  voucherCode: z
    .string()
    .length(6, "Voucher code must be exactly 6 digits")
    .regex(/^\d{6}$/, "Voucher code must contain only digits"),
});

// ─── Voucher Redemption ─────────────────────────────────────────

export const voucherRedeemSchema = z.object({
  voucherId: z.string().min(1, "Voucher ID is required"),
  stationId: z.string().min(1, "Station ID is required"),
});

// ─── Voucher Query Parameters ───────────────────────────────────

export const voucherQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["UNUSED", "USED", "EXPIRED", "ALL"]).default("ALL"),
  search: z.string().optional(),
  batchId: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CsvRowInput = z.infer<typeof csvRowSchema>;
export type VoucherVerifyInput = z.infer<typeof voucherVerifySchema>;
export type VoucherRedeemInput = z.infer<typeof voucherRedeemSchema>;
export type VoucherQueryInput = z.infer<typeof voucherQuerySchema>;

// ─── IoT Device Validators ──────────────────────────────────────

export const deviceVoucherVerifySchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .max(20, "Phone number too long")
    .transform((v) => v.trim()),
  voucher_code: z
    .string()
    .min(4, "Voucher code too short")
    .max(12, "Voucher code too long")
    .regex(/^\d+$/, "Voucher code must contain only digits"),
  device_id: z.string().min(1, "Device ID is required"),
});

export const deviceVoucherRedeemSchema = z.object({
  voucher_code: z
    .string()
    .min(4, "Voucher code too short")
    .max(12, "Voucher code too long"),
  device_id: z.string().min(1, "Device ID is required"),
  litres_dispensed: z.number().positive("Litres must be positive").max(50, "Exceeds maximum dispense limit"),
});

export const deviceSalesReportSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  litres: z.number().positive("Litres must be positive"),
  amount: z.number().positive("Amount must be positive"),
  payment_type: z.enum(["cash", "voucher"]),
  voucher_code: z.string().optional(),
  phone: z.string().optional(),
});

export const deviceHeartbeatSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  firmware_version: z.string().optional(),
  uptime_seconds: z.number().optional(),
  rssi: z.number().int().min(-120).max(0).optional(),
  free_heap: z.number().int().min(0).optional(),
  ip_address: z.string().optional(),
  temperature: z.number().optional(),
  pump_cycles: z.number().int().min(0).optional(),
  oil_level: z.number().min(0).max(100).optional(),
  last_voucher: z.string().optional(),
});

export const bulkHeartbeatSchema = z.object({
  heartbeats: z.array(deviceHeartbeatSchema).min(1).max(50),
});

export const otaCheckSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  current_version: z.string().min(1, "Current firmware version is required"),
});

export const machineCreateSchema = z.object({
  name: z.string().min(1, "Machine name is required").max(100),
  location: z.string().max(255).default(""),
  stationId: z.string().optional(),
  pricePerLitre: z.number().positive().default(45.0),
});

export const machineUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  location: z.string().max(255).optional(),
  stationId: z.string().nullable().optional(),
  pricePerLitre: z.number().positive().optional(),
  status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE"]).optional(),
  targetFirmware: z.string().optional(),
  otaUrl: z.string().url().optional(),
  heartbeatInterval: z.number().int().min(10).max(3600).optional(),
});

export const firmwareReleaseSchema = z.object({
  version: z.string().min(1, "Version is required"),
  url: z.string().url("Valid URL required"),
  checksum: z.string().min(1, "SHA-256 checksum required"),
  releaseNotes: z.string().optional(),
  isStable: z.boolean().default(false),
});

export const otaPushSchema = z.object({
  firmwareVersion: z.string().min(1),
  otaUrl: z.string().url(),
  targetStationId: z.string().optional(),
  targetDeviceIds: z.array(z.string()).optional(),
});

// ─── Transaction & Inventory Validators ─────────────────────────

export const deviceTransactionLogSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  transaction_type: z.enum(["voucher", "purchase"]),
  voucher_code: z.string().optional(),
  oil_ml_dispensed: z.number().positive("Oil amount must be positive").max(50000, "Exceeds max dispense"),
  payment_amount: z.number().min(0).optional(),
  timestamp: z.string().optional(),
});

export const machineRefillSchema = z.object({
  litres: z.number().positive("Refill amount must be positive"),
});

export type DeviceVoucherVerifyInput = z.infer<typeof deviceVoucherVerifySchema>;
export type DeviceVoucherRedeemInput = z.infer<typeof deviceVoucherRedeemSchema>;
export type DeviceSalesReportInput = z.infer<typeof deviceSalesReportSchema>;
export type DeviceHeartbeatInput = z.infer<typeof deviceHeartbeatSchema>;
export type BulkHeartbeatInput = z.infer<typeof bulkHeartbeatSchema>;
export type OtaCheckInput = z.infer<typeof otaCheckSchema>;
export type MachineCreateInput = z.infer<typeof machineCreateSchema>;
export type MachineUpdateInput = z.infer<typeof machineUpdateSchema>;
export type FirmwareReleaseInput = z.infer<typeof firmwareReleaseSchema>;
export type OtaPushInput = z.infer<typeof otaPushSchema>;
export type DeviceTransactionLogInput = z.infer<typeof deviceTransactionLogSchema>;
export type MachineRefillInput = z.infer<typeof machineRefillSchema>;
