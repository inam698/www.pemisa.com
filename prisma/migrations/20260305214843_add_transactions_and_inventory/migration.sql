-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machine_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "voucher_code" TEXT,
    "oil_ml" REAL NOT NULL,
    "amount_paid" REAL,
    "oil_remaining_after" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_machines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_id" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "api_key_suffix" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT 'Dispenser',
    "location" TEXT NOT NULL DEFAULT '',
    "station_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "last_seen" DATETIME,
    "oil_level" REAL,
    "temperature" REAL,
    "last_voucher" TEXT,
    "pump_cycles" INTEGER,
    "price_per_litre" REAL NOT NULL DEFAULT 45.0,
    "firmware_version" TEXT,
    "target_firmware" TEXT,
    "ota_url" TEXT,
    "config_version" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_interval" INTEGER NOT NULL DEFAULT 60,
    "ip_address" TEXT,
    "rssi" INTEGER,
    "uptime_seconds" INTEGER,
    "oil_capacity_litres" REAL NOT NULL DEFAULT 5000,
    "oil_remaining_litres" REAL NOT NULL DEFAULT 5000,
    "total_dispensed" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "machines_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_machines" ("api_key_hash", "api_key_suffix", "config_version", "created_at", "device_id", "firmware_version", "heartbeat_interval", "id", "ip_address", "last_seen", "last_voucher", "location", "name", "oil_level", "ota_url", "price_per_litre", "pump_cycles", "rssi", "station_id", "status", "target_firmware", "temperature", "total_dispensed", "updated_at", "uptime_seconds") SELECT "api_key_hash", "api_key_suffix", "config_version", "created_at", "device_id", "firmware_version", "heartbeat_interval", "id", "ip_address", "last_seen", "last_voucher", "location", "name", "oil_level", "ota_url", "price_per_litre", "pump_cycles", "rssi", "station_id", "status", "target_firmware", "temperature", "total_dispensed", "updated_at", "uptime_seconds" FROM "machines";
DROP TABLE "machines";
ALTER TABLE "new_machines" RENAME TO "machines";
CREATE UNIQUE INDEX "machines_device_id_key" ON "machines"("device_id");
CREATE INDEX "machines_device_id_idx" ON "machines"("device_id");
CREATE INDEX "machines_station_id_idx" ON "machines"("station_id");
CREATE INDEX "machines_status_idx" ON "machines"("status");
CREATE INDEX "machines_last_seen_idx" ON "machines"("last_seen");
CREATE INDEX "machines_status_last_seen_idx" ON "machines"("status", "last_seen");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "transactions_machine_id_idx" ON "transactions"("machine_id");

-- CreateIndex
CREATE INDEX "transactions_device_id_idx" ON "transactions"("device_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "transactions_machine_id_created_at_idx" ON "transactions"("machine_id", "created_at");
