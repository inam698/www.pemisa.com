/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Voucher Service Implementation ║
 * ║                                                              ║
 * ║  Handles voucher verification and redemption via the        ║
 * ║  Pimisa cloud API. Parses JSON responses safely.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include "voucher_service.h"
#include "config.h"
#include <ArduinoJson.h>

// ─── Public Methods ─────────────────────────────────────────────

void VoucherService::begin(ApiClient* apiClient, const char* deviceId) {
  _api = apiClient;
  _deviceId = String(deviceId);
  Serial.println("[Voucher] Service initialized");
}

VoucherResult VoucherService::verify(const char* phone, const char* voucherCode) {
  VoucherResult result;
  result.approved = false;
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

  // ── Send API request ──────────────────────────────────────────
  ApiResponse response = _api->post("/api/voucher/verify", doc);

  if (!response.success) {
    result.message = "Server error";
    result.errorDetail = response.errorMessage;
    Serial.printf("[Voucher] Verify failed: %s\n", response.errorMessage.c_str());
    return result;
  }

  // ── Parse server response ─────────────────────────────────────
  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response.body);
  if (err) {
    result.message = "Invalid server response";
    result.errorDetail = String(err.c_str());
    Serial.printf("[Voucher] JSON parse error: %s\n", err.c_str());
    return result;
  }

  // Server returns: { status: "approved"|"rejected", litres, amount, message, voucher_code }
  const char* status = resDoc["status"] | "rejected";

  if (strcmp(status, "approved") == 0) {
    result.approved = true;
    result.litres = resDoc["litres"] | 0.0f;
    result.amount = resDoc["amount"] | 0.0f;
    result.message = resDoc["message"] | "Voucher approved";

    // Use server-returned voucher code if available
    const char* serverCode = resDoc["voucher_code"] | voucherCode;
    result.voucherCode = String(serverCode);

    // Extract beneficiary name from server response
    const char* ownerName = resDoc["beneficiary_name"] | "";
    result.beneficiaryName = String(ownerName);

    Serial.printf("[Voucher] APPROVED: %.3f litres (K%.2f) for %s\n",
                  result.litres, result.amount, ownerName);
  } else {
    result.approved = false;
    result.message = resDoc["message"] | "Voucher rejected";
    result.errorDetail = resDoc["error"] | "";
    Serial.printf("[Voucher] REJECTED: %s\n", result.message.c_str());
  }

  return result;
}

bool VoucherService::redeem(const char* voucherCode, float litresDispensed) {
  if (!_api) {
    Serial.println("[Voucher] Error: API client not initialized");
    return false;
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

  if (!response.success) {
    Serial.printf("[Voucher] Redeem failed: %s (HTTP %d)\n",
                  response.errorMessage.c_str(), response.httpCode);

    // Store for offline retry if server unreachable
    if (response.httpCode == 0 || response.httpCode >= 500) {
      Serial.println("[Voucher] Will retry redemption later");
      // TODO: Queue for offline retry (SPIFFS/NVS storage)
    }
    return false;
  }

  // ── Parse server response ─────────────────────────────────────
  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response.body);
  if (err) {
    Serial.printf("[Voucher] Redeem response parse error: %s\n", err.c_str());
    return false;
  }

  bool success = resDoc["success"] | false;
  const char* msg = resDoc["message"] | "Unknown";

  Serial.printf("[Voucher] Redeem result: %s — %s\n",
                success ? "OK" : "FAILED", msg);

  return success;
}
