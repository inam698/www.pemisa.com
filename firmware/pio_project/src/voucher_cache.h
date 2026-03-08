/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Voucher Cache Module           ║
 * ║                                                              ║
 * ║  Caches active vouchers locally on ESP32 for offline        ║
 * ║  verification when internet is unavailable.                 ║
 * ║                                                              ║
 * ║  - Downloads voucher list from server periodically          ║
 * ║  - Stores compact voucher data in RAM (PSRAM if available)  ║
 * ║  - Provides local verify() when server unreachable          ║
 * ║  - Tracks locally-used codes to prevent double-dispensing   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef VOUCHER_CACHE_H
#define VOUCHER_CACHE_H

#include <Arduino.h>
#include "api_client.h"

// Maximum vouchers that can be cached locally
#define VOUCHER_CACHE_MAX       500

// Maximum locally-used vouchers tracked (prevents double-dispensing offline)
#define VOUCHER_USED_MAX        100

// Cache refresh interval (5 minutes when online)
#define VOUCHER_CACHE_REFRESH_MS  300000UL

// ─── Cached Voucher Entry ───────────────────────────────────────

struct CachedVoucher {
  char code[9];        // Up to 8-digit voucher code + null
  char phone9[10];     // Last 9 digits of phone + null
  float litres;        // Entitled litres
  float amount;        // Value in ZMW
  uint32_t expiryTs;   // Unix timestamp (seconds)
  char name[21];       // Beneficiary name (truncated to 20 chars)
};

// ─── Offline Verification Result ────────────────────────────────

struct OfflineVoucherResult {
  bool found;            // Voucher found in cache
  bool approved;         // Approved (found + phone match + not used + not expired)
  float litres;
  float amount;
  String beneficiaryName;
  String message;
};

// ─── Voucher Cache Class ────────────────────────────────────────

class VoucherCache {
public:
  /**
   * Initialize the cache.
   * @param apiClient  Initialized ApiClient for downloading vouchers
   */
  void begin(ApiClient* apiClient);

  /**
   * Call in loop(). Refreshes cache when interval elapses and online.
   * Non-blocking.
   */
  void loop();

  /**
   * Force an immediate cache refresh from server.
   * @return true if refresh succeeded
   */
  bool refresh();

  /**
   * Verify a voucher against the local cache (offline mode).
   * @param phone       Phone number entered by user (raw digits)
   * @param voucherCode Voucher code entered by user
   * @return OfflineVoucherResult with approval status
   */
  OfflineVoucherResult verifyOffline(const char* phone, const char* voucherCode);

  /**
   * Mark a voucher as used locally (after offline dispensing).
   * Prevents double-dispensing of the same code while offline.
   * @param voucherCode The code that was dispensed
   */
  void markUsedLocally(const char* voucherCode);

  /** Returns true if cache has vouchers loaded. */
  bool hasCachedVouchers() const;

  /** Returns the number of cached vouchers. */
  int getCachedCount() const;

  /** Returns seconds since last successful cache refresh. */
  unsigned long getSecondsSinceRefresh() const;

  /** Returns number of locally-used voucher codes. */
  int getLocallyUsedCount() const;

  /** Clear all locally-used tracking (call after syncing with server). */
  void clearLocallyUsed();

private:
  ApiClient* _api = nullptr;

  // Voucher cache (RAM)
  CachedVoucher _cache[VOUCHER_CACHE_MAX];
  int _cacheCount = 0;
  unsigned long _lastRefreshMs = 0;
  uint32_t _serverTimestamp = 0;  // Server time of last cache

  // Locally-used codes (prevents double-spend offline)
  char _usedCodes[VOUCHER_USED_MAX][9];
  int _usedCount = 0;

  // Helpers
  bool _isUsedLocally(const char* code) const;
  String _extractPhone9(const char* phone) const;
};

#endif // VOUCHER_CACHE_H
