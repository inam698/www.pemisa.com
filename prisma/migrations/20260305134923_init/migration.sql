-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STATION',
    "station_id" TEXT,
    "totp_secret" TEXT,
    "backup_codes" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "station_name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "litres" REAL NOT NULL DEFAULT 0,
    "voucher_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNUSED',
    "expiry_date" DATETIME NOT NULL,
    "station_id" TEXT,
    "redeemed_at" DATETIME,
    "litres_dispensed" REAL,
    "dispensed_by_device" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "batch_id" TEXT,
    CONSTRAINT "vouchers_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucher_id" TEXT,
    CONSTRAINT "sms_logs_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "target" TEXT,
    "details" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "api_key_suffix" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT 'Dispenser',
    "location" TEXT NOT NULL DEFAULT '',
    "station_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "last_seen" DATETIME,
    "price_per_litre" REAL NOT NULL DEFAULT 45.0,
    "firmware_version" TEXT,
    "target_firmware" TEXT,
    "ota_url" TEXT,
    "config_version" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_interval" INTEGER NOT NULL DEFAULT 60,
    "ip_address" TEXT,
    "rssi" INTEGER,
    "uptime_seconds" INTEGER,
    "total_dispensed" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "machines_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "machine_telemetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machine_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "rssi" INTEGER,
    "uptime_seconds" INTEGER,
    "free_heap" INTEGER,
    "temperature" REAL,
    "pump_cycles" INTEGER,
    "error_count" INTEGER DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "machine_telemetry_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machine_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "station_id" TEXT,
    "litres" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "payment_type" TEXT NOT NULL,
    "voucher_code" TEXT,
    "phone" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "firmware_releases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "release_notes" TEXT,
    "is_stable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_voucher_code_key" ON "vouchers"("voucher_code");

-- CreateIndex
CREATE INDEX "vouchers_phone_idx" ON "vouchers"("phone");

-- CreateIndex
CREATE INDEX "vouchers_status_idx" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "vouchers_voucher_code_phone_idx" ON "vouchers"("voucher_code", "phone");

-- CreateIndex
CREATE INDEX "vouchers_expiry_date_idx" ON "vouchers"("expiry_date");

-- CreateIndex
CREATE INDEX "vouchers_batch_id_idx" ON "vouchers"("batch_id");

-- CreateIndex
CREATE INDEX "sms_logs_phone_idx" ON "sms_logs"("phone");

-- CreateIndex
CREATE INDEX "sms_logs_voucher_id_idx" ON "sms_logs"("voucher_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "machines_device_id_key" ON "machines"("device_id");

-- CreateIndex
CREATE INDEX "machines_device_id_idx" ON "machines"("device_id");

-- CreateIndex
CREATE INDEX "machines_station_id_idx" ON "machines"("station_id");

-- CreateIndex
CREATE INDEX "machines_status_idx" ON "machines"("status");

-- CreateIndex
CREATE INDEX "machines_last_seen_idx" ON "machines"("last_seen");

-- CreateIndex
CREATE INDEX "machines_status_last_seen_idx" ON "machines"("status", "last_seen");

-- CreateIndex
CREATE INDEX "machine_telemetry_machine_id_created_at_idx" ON "machine_telemetry"("machine_id", "created_at");

-- CreateIndex
CREATE INDEX "machine_telemetry_device_id_created_at_idx" ON "machine_telemetry"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "machine_telemetry_created_at_idx" ON "machine_telemetry"("created_at");

-- CreateIndex
CREATE INDEX "sales_machine_id_idx" ON "sales"("machine_id");

-- CreateIndex
CREATE INDEX "sales_device_id_idx" ON "sales"("device_id");

-- CreateIndex
CREATE INDEX "sales_station_id_idx" ON "sales"("station_id");

-- CreateIndex
CREATE INDEX "sales_payment_type_idx" ON "sales"("payment_type");

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE INDEX "sales_machine_id_created_at_idx" ON "sales"("machine_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_station_id_created_at_idx" ON "sales"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_payment_type_created_at_idx" ON "sales"("payment_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "firmware_releases_version_key" ON "firmware_releases"("version");
