/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Voucher Cache Implementation   ║
 * ║                                                              ║
 * ║  Downloads active vouchers from server, stores in RAM,      ║
 * ║  and provides offline verification when internet drops.     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include "voucher_cache.h"
#include "config.h"
#include <ArduinoJson.h>
#include <WiFi.h>

// ─── Public Methods ─────────────────────────────────────────────

void VoucherCache::begin(ApiClient* apiClient) {
  _api = apiClient;
  _cacheCount = 0;
  _usedCount = 0;
  _lastRefreshMs = 0;
  _serverTimestamp = 0;
  Serial.println("[VCache] Voucher cache initialized");
}

void VoucherCache::loop() {
  // Only refresh when WiFi is connected
  if (WiFi.status() != WL_CONNECTED) return;
  if (!_api) return;

  unsigned long now = millis();

  // First refresh on boot (after 10s to let WiFi stabilize), then periodically
  if (_lastRefreshMs == 0) {
    if (now > 10000) {
      refresh();
    }
  } else if (now - _lastRefreshMs >= VOUCHER_CACHE_REFRESH_MS) {
    refresh();
  }
}

bool VoucherCache::refresh() {
  if (!_api) {
    Serial.println("[VCache] Error: API client not initialized");
    return false;
  }

  Serial.println("[VCache] Refreshing voucher cache from server...");

  ApiResponse response = _api->get("/api/device/vouchers/cache");

  if (!response.success) {
    Serial.printf("[VCache] Refresh failed: %s (HTTP %d)\n",
                  response.errorMessage.c_str(), response.httpCode);
    return false;
  }

  // Parse JSON response
  // Use a filter to reduce memory usage during parsing
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, response.body);

  if (err) {
    Serial.printf("[VCache] JSON parse error: %s\n", err.c_str());
    return false;
  }

  bool success = doc["success"] | false;
  if (!success) {
    Serial.println("[VCache] Server returned success=false");
    return false;
  }

  int count = doc["count"] | 0;
  _serverTimestamp = doc["ts"] | 0;

  JsonArray vouchers = doc["vouchers"].as<JsonArray>();
  if (vouchers.isNull()) {
    Serial.println("[VCache] No vouchers array in response");
    return false;
  }

  // Load vouchers into cache
  int loaded = 0;
  for (JsonObject v : vouchers) {
    if (loaded >= VOUCHER_CACHE_MAX) break;

    const char* code = v["c"] | "";
    const char* phone9 = v["p"] | "";
    float litres = v["l"] | 0.0f;
    float amount = v["a"] | 0.0f;
    uint32_t expiry = v["e"] | 0;
    const char* name = v["n"] | "";

    if (strlen(code) == 0 || litres <= 0) continue;

    strncpy(_cache[loaded].code, code, sizeof(_cache[loaded].code) - 1);
    _cache[loaded].code[sizeof(_cache[loaded].code) - 1] = '\0';

    strncpy(_cache[loaded].phone9, phone9, sizeof(_cache[loaded].phone9) - 1);
    _cache[loaded].phone9[sizeof(_cache[loaded].phone9) - 1] = '\0';

    _cache[loaded].litres = litres;
    _cache[loaded].amount = amount;
    _cache[loaded].expiryTs = expiry;

    strncpy(_cache[loaded].name, name, sizeof(_cache[loaded].name) - 1);
    _cache[loaded].name[sizeof(_cache[loaded].name) - 1] = '\0';

    loaded++;
  }

  _cacheCount = loaded;
  _lastRefreshMs = millis();

  Serial.printf("[VCache] Cache loaded: %d vouchers (server reported %d)\n",
                _cacheCount, count);

  return true;
}

OfflineVoucherResult VoucherCache::verifyOffline(const char* phone,
                                                   const char* voucherCode) {
  OfflineVoucherResult result;
  result.found = false;
  result.approved = false;
  result.litres = 0;
  result.amount = 0;
  result.beneficiaryName = "";
  result.message = "";

  if (_cacheCount == 0) {
    result.message = "No cached data";
    return result;
  }

  // Extract last 9 digits from phone input (to match server format)
  String phone9 = _extractPhone9(phone);

  // Search cache for matching voucher code
  for (int i = 0; i < _cacheCount; i++) {
    if (strcmp(_cache[i].code, voucherCode) == 0) {
      result.found = true;

      // Check if already used locally
      if (_isUsedLocally(voucherCode)) {
        result.message = "Already redeemed";
        Serial.printf("[VCache] OFFLINE REJECT: %s already used locally\n", voucherCode);
        return result;
      }

      // Check phone match
      if (phone9.length() > 0 && strcmp(_cache[i].phone9, phone9.c_str()) != 0) {
        result.message = "Phone mismatch";
        Serial.printf("[VCache] OFFLINE REJECT: phone %s != %s\n",
                      phone9.c_str(), _cache[i].phone9);
        return result;
      }

      // Note: We can't reliably check expiry offline without NTP time sync.
      // The server already filtered expired vouchers at cache time.
      // Stale cache is handled by the short refresh interval.

      // Approved!
      result.approved = true;
      result.litres = _cache[i].litres;
      result.amount = _cache[i].amount;
      result.beneficiaryName = String(_cache[i].name);
      result.message = "Offline approved";

      Serial.printf("[VCache] OFFLINE APPROVED: %s — %.3fL (K%.2f) for %s\n",
                    voucherCode, result.litres, result.amount, _cache[i].name);
      return result;
    }
  }

  result.message = "Code not found";
  Serial.printf("[VCache] OFFLINE REJECT: code %s not in cache (%d entries)\n",
                voucherCode, _cacheCount);
  return result;
}

void VoucherCache::markUsedLocally(const char* voucherCode) {
  if (_usedCount >= VOUCHER_USED_MAX) {
    // Shift out oldest entry (FIFO)
    memmove(_usedCodes[0], _usedCodes[1],
            (VOUCHER_USED_MAX - 1) * sizeof(_usedCodes[0]));
    _usedCount = VOUCHER_USED_MAX - 1;
  }

  strncpy(_usedCodes[_usedCount], voucherCode, sizeof(_usedCodes[0]) - 1);
  _usedCodes[_usedCount][sizeof(_usedCodes[0]) - 1] = '\0';
  _usedCount++;

  Serial.printf("[VCache] Marked %s as used locally (%d tracked)\n",
                voucherCode, _usedCount);
}

bool VoucherCache::hasCachedVouchers() const {
  return _cacheCount > 0;
}

int VoucherCache::getCachedCount() const {
  return _cacheCount;
}

unsigned long VoucherCache::getSecondsSinceRefresh() const {
  if (_lastRefreshMs == 0) return 999999;
  return (millis() - _lastRefreshMs) / 1000;
}

int VoucherCache::getLocallyUsedCount() const {
  return _usedCount;
}

void VoucherCache::clearLocallyUsed() {
  _usedCount = 0;
  Serial.println("[VCache] Cleared locally-used tracking");
}

// ─── Private Helpers ────────────────────────────────────────────

bool VoucherCache::_isUsedLocally(const char* code) const {
  for (int i = 0; i < _usedCount; i++) {
    if (strcmp(_usedCodes[i], code) == 0) {
      return true;
    }
  }
  return false;
}

String VoucherCache::_extractPhone9(const char* phone) const {
  String digits = "";
  for (int i = 0; phone[i] != '\0'; i++) {
    if (phone[i] >= '0' && phone[i] <= '9') {
      digits += phone[i];
    }
  }
  // Take last 9 digits
  if (digits.length() > 9) {
    digits = digits.substring(digits.length() - 9);
  }
  return digits;
}
