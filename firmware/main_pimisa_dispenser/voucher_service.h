/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Voucher Service Module         ║
 * ║                                                              ║
 * ║  Handles voucher verification and redemption via the        ║
 * ║  Pimisa cloud API. Called by the main dispenser logic.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef VOUCHER_SERVICE_H
#define VOUCHER_SERVICE_H

#include <Arduino.h>
#include "api_client.h"
#include "offline_voucher_cache.h"
#include "nvs_storage.h"

// ─── Voucher Verification Result ────────────────────────────────

struct VoucherResult {
  bool approved;           // true if server/cache approved the voucher
  bool offlineVerified;    // true if verified from local cache (not server)
  float litres;            // Litres the voucher entitles
  float amount;            // Monetary value in ZMW
  String voucherCode;      // Voucher code (for redemption)
  String beneficiaryName;  // Name of the voucher owner
  String message;          // Human-readable status message
  String errorDetail;      // Error detail from API if rejected
};

// ─── Voucher Service Class ──────────────────────────────────────

class VoucherService {
public:
  /**
   * Initialize with a reference to the API client.
   * @param apiClient   Initialized ApiClient instance
   * @param deviceId    This machine's device ID
   * @param nvsStorage  NVS storage for queuing offline redemptions
   */
  void begin(ApiClient* apiClient, const char* deviceId, NvsStorage* nvsStorage = nullptr);

  /**
   * Verify a voucher — tries cloud server first, falls back to
   * offline cache if the server is unreachable.
   *
   * On success from server: caches the voucher locally.
   * On server failure: looks up voucher in local NVS cache.
   *
   * @param phone        Customer phone number
   * @param voucherCode  6-digit voucher code
   * @return VoucherResult with approval status and litres
   */
  VoucherResult verify(const char* phone, const char* voucherCode);

  /**
   * Confirm redemption after dispensing completes.
   * If server is unreachable, queues the redemption in NVS
   * for automatic retry when connectivity is restored.
   *
   * @param voucherCode      The voucher code that was verified
   * @param litresDispensed  Actual litres measured by flow sensor
   * @return true if server acknowledged OR queued for offline retry
   */
  bool redeem(const char* voucherCode, float litresDispensed);

  /**
   * Process queued offline redemptions. Call periodically
   * from loop() when WiFi is connected.
   */
  void processOfflineRedemptions();

  /** Returns number of cached vouchers available for offline use. */
  int getCachedVoucherCount();

  /** Returns number of pending offline redemptions. */
  int getPendingRedemptionCount();

private:
  ApiClient* _api = nullptr;
  NvsStorage* _nvs = nullptr;
  String _deviceId;
  OfflineVoucherCache _cache;
  bool _cacheInitialized = false;

  unsigned long _lastRedemptionRetryMs = 0;
  static const unsigned long REDEMPTION_RETRY_INTERVAL = 30000; // 30 seconds
};

#endif // VOUCHER_SERVICE_H
