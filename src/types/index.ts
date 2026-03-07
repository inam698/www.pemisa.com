/**
 * Application Type Definitions
 * Central type definitions shared across the application.
 */

// ─── Enum-like constants (SQLite doesn't support native enums) ──

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  STATION: "STATION",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrganizationPlan = {
  STARTER: "STARTER",
  PROFESSIONAL: "PROFESSIONAL",
  ENTERPRISE: "ENTERPRISE",
} as const;
export type OrganizationPlan = (typeof OrganizationPlan)[keyof typeof OrganizationPlan];

export const VoucherStatus = {
  UNUSED: "UNUSED",
  USED: "USED",
  EXPIRED: "EXPIRED",
} as const;
export type VoucherStatus = (typeof VoucherStatus)[keyof typeof VoucherStatus];

export const SmsStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];

// ─── Authentication Types ───────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  stationId?: string | null;
  organizationId?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    stationId?: string | null;
    stationName?: string | null;
    twoFactorEnabled?: boolean;
  };
}

// ─── CSV Types ──────────────────────────────────────────────────

export interface CsvRow {
  name: string;
  phone: string;
  email?: string;
  voucherAmount: string | number;
}

export interface ParsedCsvRow {
  name: string;
  phone: string;
  email?: string;
  amount: number;
  rowNumber: number;
}

export interface CsvValidationResult {
  validRows: ParsedCsvRow[];
  rejectedRows: RejectedRow[];
  totalRows: number;
}

export interface RejectedRow {
  rowNumber: number;
  name?: string;
  phone?: string;
  email?: string;
  voucherAmount?: string | number;
  reason: string;
}

// ─── Voucher Types ──────────────────────────────────────────────

export interface VoucherGenerationResult {
  totalGenerated: number;
  totalSkipped: number;
  skippedPhones: string[];
  batchId: string;
}

export interface VoucherVerifyRequest {
  phone: string;
  voucherCode: string;
}

export interface VoucherVerifyResponse {
  valid: boolean;
  message: string;
  voucher?: {
    id: string;
    name: string;
    amount: number;
    voucherCode: string;
    expiryDate: string;
  };
}

export interface VoucherRedeemRequest {
  voucherId: string;
  stationId: string;
}

// ─── Dashboard Types ────────────────────────────────────────────

export interface DashboardMetrics {
  totalVouchers: number;
  redeemedVouchers: number;
  unusedVouchers: number;
  expiredVouchers: number;
  totalAmount: number;
  redeemedAmount: number;
  recentRedemptions: RecentRedemption[];
}

export interface RecentRedemption {
  id: string;
  name: string;
  phone: string;
  amount: number;
  stationName: string;
  redeemedAt: string;
}

// ─── API Response Types ─────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Voucher Table Types ────────────────────────────────────────

export interface VoucherTableRow {
  id: string;
  name: string;
  phone: string;
  amount: number;
  voucherCode: string;
  status: string;
  stationName: string | null;
  redeemedAt: string | null;
  expiryDate: string;
  createdAt: string;
}

// ─── IoT / Machine Types ────────────────────────────────────────

export const MachineStatus = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  MAINTENANCE: "MAINTENANCE",
} as const;
export type MachineStatus = (typeof MachineStatus)[keyof typeof MachineStatus];

export const PaymentType = {
  CASH: "CASH",
  VOUCHER: "VOUCHER",
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const TransactionType = {
  VOUCHER: "voucher",
  PURCHASE: "purchase",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export interface DeviceAuthPayload {
  deviceId: string;
  machineId: string;
  stationId: string | null;
}

export interface DeviceVoucherVerifyRequest {
  phone: string;
  voucher_code: string;
  device_id: string;
}

export interface DeviceVoucherVerifyResponse {
  status: "approved" | "rejected";
  litres: number;
  amount: number;
  message?: string;
  voucher_code?: string;
}

export interface DeviceVoucherRedeemRequest {
  voucher_code: string;
  device_id: string;
  litres_dispensed: number;
}

export interface DeviceSalesReportRequest {
  device_id: string;
  litres: number;
  amount: number;
  payment_type: "cash" | "voucher";
  voucher_code?: string;
  phone?: string;
}

export interface DeviceHeartbeatRequest {
  device_id: string;
  firmware_version?: string;
  uptime_seconds?: number;
  rssi?: number;
  free_heap?: number;
  ip_address?: string;
  temperature?: number;
  pump_cycles?: number;
  oil_level?: number;
  last_voucher?: string;
}

export interface HeartbeatResponse {
  success: boolean;
  server_time: string;
  config_version?: number;
  price_per_litre?: number;
  heartbeat_interval?: number;
  ota_update?: {
    version: string;
    url: string | null;
  };
}

export interface OtaCheckRequest {
  device_id: string;
  current_version: string;
}

export interface OtaCheckResponse {
  update_available: boolean;
  version?: string;
  url?: string | null;
  checksum?: string | null;
  release_notes?: string | null;
}

export interface BulkHeartbeatRequest {
  heartbeats: DeviceHeartbeatRequest[];
}

export interface TelemetrySnapshot {
  machineId: string;
  deviceId: string;
  rssi?: number;
  uptimeSeconds?: number;
  freeHeap?: number;
  temperature?: number;
  pumpCycles?: number;
  errorCount?: number;
  createdAt: string;
}

export interface MachineTableRow {
  id: string;
  deviceId: string;
  name: string;
  location: string;
  stationName: string | null;
  status: string;
  lastSeen: string | null;
  pricePerLitre: number;
  firmwareVersion: string | null;
  createdAt: string;
}

export interface SaleTableRow {
  id: string;
  deviceId: string;
  machineName: string;
  litres: number;
  amount: number;
  paymentType: string;
  voucherCode: string | null;
  phone: string | null;
  createdAt: string;
}

export interface IoTDashboardMetrics {
  totalMachines: number;
  onlineMachines: number;
  offlineMachines: number;
  totalSales: number;
  totalCashSales: number;
  totalVoucherSales: number;
  totalLitresDispensed: number;
  totalRevenue: number;
}

// ─── Transaction Types ──────────────────────────────────────────

export interface DeviceTransactionLogRequest {
  device_id: string;
  transaction_type: "voucher" | "purchase";
  voucher_code?: string;
  oil_ml_dispensed: number;
  payment_amount?: number;
  timestamp?: string;
}

export interface TransactionTableRow {
  id: string;
  machineId: string;
  deviceId: string;
  type: string;
  voucherCode: string | null;
  oilMl: number;
  oilLitres: number;
  amountPaid: number | null;
  oilRemainingAfter: number | null;
  createdAt: string;
}

export interface MachineInventory {
  deviceId: string;
  name: string;
  oilCapacityLitres: number;
  oilRemainingLitres: number;
  oilRemainingPercent: number;
}
