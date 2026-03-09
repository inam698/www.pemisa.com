/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Voucher Service Implementation ║
 * ║                                                              ║
 * ║  Handles voucher verification and redemption via the        ║
 * ║  Pimisa cloud API with full OFFLINE support:                ║
 * ║                                                              ║
 * ║  1. On ONLINE verify success → caches voucher in NVS flash  ║
 * ║  2. On server unreachable → falls back to NVS cache lookup  ║
 * ║  3. On redeem failure → queues redemption in NVS for retry  ║
 * ║  4. processOfflineRedemptions() retries queued redemptions  ║
 * ║                                                              ║
 * ║  Result: customers can ALWAYS redeem vouchers, even when    ║
 * ║  the device has no internet, as long as the voucher was     ║
 * ║  verified at least once before on this machine.             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include "voucher_service.h"
#include "config.h"
#include <ArduinoJson.h>

// ─── Initialisation ─────────────────────────────────────────────

void VoucherService::begin(ApiClient* apiClient, const char* deviceId, NvsStorage* nvsStorage) {
  _api = apiClient;
  _nvs = nvsStorage;
  _deviceId = String(deviceId);

  // Initialize offline voucher cache (24h TTL)
  _cacheInitialized = _cache.begin(VOUCHER_CACHE_DEFAULT_TTL);
  if (_cacheInitialized) {
    Serial.printf("[Voucher] Service initialized with offline cache (%d cached)\n",
                  _cache.getValidCount());
  } else {
    Serial.println("[Voucher] Service initialized (cache unavailable)");
  }
}

// ─── Verify ─────────────────────────────────────────────────────
//
// Strategy:
//   1. Try the cloud server first
//   2. On success → cache voucher locally for future offline use
//   3. On server failure → look up voucher in local NVS cache
//   4. On cache hit → approve with offlineVerified=true flag
//

VoucherResult VoucherService::verify(const char* phone, const char* voucherCode) {
  VoucherResult result;
  result.approved = false;
  result.offlineVerified = false;
  result.litres = 0;
  result.amount = 0;
  result.voucherCode = String(voucherCode);
  result.beneficiaryName = "";
  result.message = "";
  result.errorDetail = "";

  if (!_api) {
    result.message = "API not initialized";
    result.errorDetail = "Call begin() first";
    Serial.println("[Voucher] Error: API client not initialized");
    return result;
  }

  // ── Build JSON payload ────────────────────────────────────────
  JsonDocument doc;
  doc["phone"] = phone;
  doc["voucher_code"] = voucherCode;
  doc["device_id"] = _deviceId;

  Serial.printf("[Voucher] Verifying: phone=%s code=%s\n", phone, voucherCode);

  // ── Try server first ──────────────────────────────────────────
  ApiResponse response = _api->post("/api/voucher/verify", doc);

  if (response.success) {
    // ── Parse server response ─────────────────────────────────
    JsonDocument resDoc;
    DeserializationError err = deserializeJson(resDoc, response.body);

    if (err) {
      result.message = "Invalid server response";
      result.errorDetail = String(err.c_str());
      Serial.printf("[Voucher] JSON parse error: %s\n", err.c_str());
      // Don't return yet — try offline cache below
    } else {
      const char* status = resDoc["status"] | "rejected";

      if (strcmp(status, "approved") == 0) {
        result.approved = true;
        result.offlineVerified = false;
        result.litres = resDoc["litres"] | 0.0f;
        result.amount = resDoc["amount"] | 0.0f;
        result.message = resDoc["message"] | "Voucher approved";

        const char* serverCode = resDoc["voucher_code"] | voucherCode;
        result.voucherCode = String(serverCode);

        const char* ownerName = resDoc["beneficiary_name"] | "";
        result.beneficiaryName = String(ownerName);

        Serial.printf("[Voucher] ONLINE APPROVED: %.3f litres (K%.2f) for %s\n",
                      result.litres, result.amount, ownerName);

        // ── Cache for future offline use ────────────────────
        if (_cacheInitialized) {
          _cache.cacheVoucher(result.voucherCode.c_str(), phone,
                              result.litres, result.amount);
        }

        return result;
      } else {
        // Server explicitly rejected — do NOT try offline cache
        result.approved = false;
        result.message = resDoc["message"] | "Voucher rejected";
        result.errorDetail = resDoc["error"] | "";
        Serial.printf("[Voucher] REJECTED by server: %s\n", result.message.c_str());
        return result;
      }
    }
  }

  // ── Server unreachable or parse error — try offline cache ─────
  Serial.printf("[Voucher] Server unavailable (%s), checking offline cache...\n",
                response.errorMessage.c_str());

  if (!_cacheInitialized) {
    result.message = "No connection";
    result.errorDetail = "Offline cache unavailable";
    Serial.println("[Voucher] Offline cache not initialized");
    return result;
  }

  CachedVoucher cached;
  if (_cache.lookupVoucher(phone, voucherCode, cached)) {
    // Found in cache — approve with offline flag
    result.approved = true;
    result.offlineVerified = true;
    result.litres = cached.litres;
    result.amount = cached.amount;
    result.voucherCode = String(cached.voucherCode);
    result.beneficiaryName = "";   // Not stored in cache
    result.message = "Offline approved";

    Serial.printf("[Voucher] OFFLINE APPROVED: %.3f litres (K%.2f) from cache\n",
                  result.litres, result.amount);
    return result;
  }

  // Not in cache either
  result.message = "No connection";
  result.errorDetail = "Voucher not in offline cache";
  Serial.println("[Voucher] Not found in offline cache");
  return result;
}

// ─── Redeem ─────────────────────────────────────────────────────
//
// Strategy:
//   1. Try sending redemption to server
//   2. On success → mark cached voucher as used
//   3. On failure → queue in NVS for automatic retry later
//

bool VoucherService::redeem(const char* voucherCode, float litresDispensed) {
  if (!_api) {
    Serial.println("[Voucher] Error: API client not initialized");
    return false;
  }

  // Mark as used in local cache immediately (prevent double-redeem offline)
  if (_cacheInitialized) {
    _cache.markUsed(voucherCode);
  }

  // ── Build JSON payload ────────────────────────────────────────
  JsonDocument doc;
  doc["voucher_code"] = voucherCode;
  doc["device_id"] = _deviceId;
  doc["litres_dispensed"] = litresDispensed;

  Serial.printf("[Voucher] Redeeming: code=%s litres=%.3f\n",
                voucherCode, litresDispensed);

  // ── Send API request ──────────────────────────────────────────
  ApiResponse response = _api->post("/api/voucher/redeem", doc);

  if (response.success) {
    JsonDocument resDoc;
    DeserializationError err = deserializeJson(resDoc, response.body);
    if (!err) {
      bool success = resDoc["success"] | false;
      const char* msg = resDoc["message"] | "Unknown";
      Serial.printf("[Voucher] Redeem result: %s — %s\n",
                    success ? "OK" : "FAILED", msg);
      if (success) return true;
    }
  }

  // ── Server unreachable — queue for offline retry ──────────────
  Serial.printf("[Voucher] Redeem failed (%s), queuing for offline retry\n",
                response.errorMessage.c_str());

  if (_nvs) {
    OfflineSale sale;
    sale.litres = litresDispensed;
    sale.amount = 0; // Will be resolved on sync
    strncpy(sale.paymentType, "voucher", sizeof(sale.paymentType) - 1);
    sale.paymentType[sizeof(sale.paymentType) - 1] = '\0';
    strncpy(sale.voucherCode, voucherCode, sizeof(sale.voucherCode) - 1);
    sale.voucherCode[sizeof(sale.voucherCode) - 1] = '\0';
    sale.phone[0] = '\0';
    sale.timestamp = millis() / 1000;

    if (_nvs->pushOfflineSale(sale)) {
      Serial.printf("[Voucher] Redemption queued in NVS (pending: %d)\n",
                    _nvs->getOfflineSaleCount());
      return true; // Return true — dispensing should not be blocked
    } else {
      Serial.println("[Voucher] WARNING: Failed to queue in NVS!");
    }
  }

  return false;
}

// ─── Process Offline Redemption Queue ───────────────────────────
//
// Called from loop() when WiFi is available.
// Retries sending queued voucher redemptions to the server.
//

void VoucherService::processOfflineRedemptions() {
  if (!_nvs || !_api) return;

  int pending = _nvs->getOfflineSaleCount();
  if (pending == 0) return;

  unsigned long now = millis();
  if (now - _lastRedemptionRetryMs < REDEMPTION_RETRY_INTERVAL) return;
  _lastRedemptionRetryMs = now;

  Serial.printf("[Voucher] Retrying %d queued offline redemptions...\n", pending);

  int processed = 0;
  int maxBatch = 3; // Process up to 3 per cycle
  OfflineSale sale;

  while (_nvs->peekOfflineSale(sale) && processed < maxBatch) {
    // Only process voucher-type sales here (cash sales handled by SalesReporting)
    if (strcmp(sale.paymentType, "voucher") != 0) {
      break; // Let uploadNvsSales() handle non-voucher entries
    }

    JsonDocument doc;
    doc["voucher_code"] = sale.voucherCode;
    doc["device_id"] = _deviceId;
    doc["litres_dispensed"] = sale.litres;

    ApiResponse response = _api->post("/api/voucher/redeem", doc);

    if (response.success) {
      JsonDocument resDoc;
      DeserializationError err = deserializeJson(resDoc, response.body);
      bool ok = !err && (resDoc["success"] | false);

      if (ok) {
        _nvs->popOfflineSale();
        processed++;
        Serial.printf("[Voucher] Offline redemption synced: %s (remaining: %d)\n",
                      sale.voucherCode, _nvs->getOfflineSaleCount());
        continue;
      }
    }

    // Server still unreachable — stop retrying this cycle
    Serial.println("[Voucher] Server unreachable, will retry next cycle");
    break;
  }

  if (processed > 0) {
    Serial.printf("[Voucher] Synced %d offline redemptions\n", processed);
  }
}

// ─── Stats ──────────────────────────────────────────────────────

int VoucherService::getCachedVoucherCount() {
  return _cacheInitialized ? _cache.getValidCount() : 0;
}

int VoucherService::getPendingRedemptionCount() {
  return _nvs ? _nvs->getOfflineSaleCount() : 0;
}
