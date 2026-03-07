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

// ─── Voucher Verification Result ────────────────────────────────

struct VoucherResult {
  bool approved;           // true if server approved the voucher
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
   * @param apiClient  Initialized ApiClient instance
   * @param deviceId   This machine's device ID
   */
  void begin(ApiClient* apiClient, const char* deviceId);

  /**
   * Verify a voucher with the cloud server.
   * Sends phone + voucher code to POST /api/voucher/verify.
   *
   * @param phone        Customer phone number
   * @param voucherCode  6-digit voucher code
   * @return VoucherResult with approval status and litres
   */
  VoucherResult verify(const char* phone, const char* voucherCode);

  /**
   * Confirm redemption after dispensing completes.
   * Sends actual litres dispensed to POST /api/voucher/redeem.
   *
   * @param voucherCode      The voucher code that was verified
   * @param litresDispensed  Actual litres measured by flow sensor
   * @return true if server acknowledged the redemption
   */
  bool redeem(const char* voucherCode, float litresDispensed);

private:
  ApiClient* _api = nullptr;
  String _deviceId;
};

#endif // VOUCHER_SERVICE_H
