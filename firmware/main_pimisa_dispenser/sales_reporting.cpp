/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Sales Reporting Implementation ║
 * ║                                                              ║
 * ║  Reports transactions to cloud. Queues offline sales in a   ║
 * ║  circular buffer and retries when connectivity is restored.  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include "sales_reporting.h"
#include "config.h"
#include <ArduinoJson.h>

// ─── Public Methods ─────────────────────────────────────────────

void SalesReporting::begin(ApiClient* apiClient, const char* deviceId, float pricePerLitre) {
  _api = apiClient;
  _deviceId = String(deviceId);
  _pricePerLitre = pricePerLitre;
  _queueHead = 0;
  _queueTail = 0;
  _queueCount = 0;
  Serial.printf("[Sales] Service initialized — Price: K%.2f/L\n", _pricePerLitre);
}

bool SalesReporting::reportCashSale(float litres, float amountPaid) {
  SaleRecord sale;
  sale.litres = litres;
  sale.amount = amountPaid;
  sale.paymentType = "cash";
  sale.voucherCode = "";
  sale.phone = "";
  sale.timestamp = millis();
  sale.reported = false;

  Serial.printf("[Sales] Reporting CASH sale: %.3fL for K%.2f\n", litres, amountPaid);

  if (_sendSaleReport(sale)) {
    sale.reported = true;
    Serial.println("[Sales] Cash sale reported successfully");
    return true;
  }

  // Queue for offline retry
  _enqueue(sale);
  Serial.printf("[Sales] Cash sale queued for retry (queue: %d/%d)\n",
                _queueCount, OFFLINE_QUEUE_SIZE);
  return true; // Return true — sale is queued, dispensing should continue
}

bool SalesReporting::reportVoucherSale(float litres, float amount,
                                        const char* voucherCode, const char* phone) {
  SaleRecord sale;
  sale.litres = litres;
  sale.amount = amount;
  sale.paymentType = "voucher";
  sale.voucherCode = String(voucherCode);
  sale.phone = String(phone);
  sale.timestamp = millis();
  sale.reported = false;

  Serial.printf("[Sales] Reporting VOUCHER sale: %.3fL for K%.2f (code=%s)\n",
                litres, amount, voucherCode);

  if (_sendSaleReport(sale)) {
    sale.reported = true;
    Serial.println("[Sales] Voucher sale reported successfully");
    return true;
  }

  // Queue for offline retry
  _enqueue(sale);
  Serial.printf("[Sales] Voucher sale queued for retry (queue: %d/%d)\n",
                _queueCount, OFFLINE_QUEUE_SIZE);
  return true;
}

float SalesReporting::amountToLitres(float amountZMW) const {
  if (_pricePerLitre <= 0) return 0;
  return amountZMW / _pricePerLitre;
}

float SalesReporting::litresToAmount(float litres) const {
  return litres * _pricePerLitre;
}

void SalesReporting::setPricePerLitre(float newPrice) {
  if (newPrice > 0) {
    _pricePerLitre = newPrice;
    Serial.printf("[Sales] Price updated: K%.2f/L\n", _pricePerLitre);
  }
}

float SalesReporting::getPricePerLitre() const {
  return _pricePerLitre;
}

uint8_t SalesReporting::getQueuedCount() const {
  return _queueCount;
}

void SalesReporting::processOfflineQueue() {
  if (_queueCount == 0) return;

  unsigned long now = millis();
  if (now - _lastQueueRetryMs < QUEUE_RETRY_INTERVAL) return;
  _lastQueueRetryMs = now;

  Serial.printf("[Sales] Processing offline queue (%d pending)...\n", _queueCount);

  uint8_t processed = 0;
  uint8_t maxBatch = 5; // Process up to 5 per cycle to avoid blocking

  while (_queueCount > 0 && processed < maxBatch) {
    SaleRecord& sale = _queue[_queueTail];

    if (_sendSaleReport(sale)) {
      sale.reported = true;
      // Advance tail pointer
      _queueTail = (_queueTail + 1) % OFFLINE_QUEUE_SIZE;
      _queueCount--;
      processed++;
      Serial.printf("[Sales] Queued sale sent (%d remaining)\n", _queueCount);
    } else {
      // Server still unreachable — stop retrying this cycle
      Serial.println("[Sales] Server unreachable, will retry next cycle");
      break;
    }
  }

  if (processed > 0) {
    Serial.printf("[Sales] Processed %d queued sales\n", processed);
  }
}

// ─── Private Methods ────────────────────────────────────────────

bool SalesReporting::_sendSaleReport(const SaleRecord& sale) {
  if (!_api) {
    Serial.println("[Sales] Error: API client not initialized");
    return false;
  }

  JsonDocument doc;
  doc["device_id"] = _deviceId;
  doc["litres"] = sale.litres;
  doc["amount"] = sale.amount;
  doc["payment_type"] = sale.paymentType;

  if (sale.voucherCode.length() > 0) {
    doc["voucher_code"] = sale.voucherCode;
  }
  if (sale.phone.length() > 0) {
    doc["phone"] = sale.phone;
  }

  ApiResponse response = _api->post("/api/sales/report", doc);

  if (!response.success) {
    Serial.printf("[Sales] Report failed: %s (HTTP %d)\n",
                  response.errorMessage.c_str(), response.httpCode);
    return false;
  }

  // Parse response to confirm
  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response.body);
  if (err) {
    Serial.printf("[Sales] Response parse error: %s\n", err.c_str());
    return false;
  }

  bool success = resDoc["success"] | false;
  if (success) {
    const char* saleId = resDoc["sale_id"] | "?";
    Serial.printf("[Sales] Confirmed: sale_id=%s\n", saleId);
  }

  return success;
}

bool SalesReporting::logTransaction(const char* type, float oilMl,
                                     float paymentAmt, const char* voucherCode) {
  return _sendTransactionLog(type, oilMl, paymentAmt, voucherCode);
}

bool SalesReporting::_sendTransactionLog(const char* type, float oilMl,
                                          float paymentAmt, const char* voucherCode) {
  if (!_api) return false;

  JsonDocument doc;
  doc["device_id"] = _deviceId;
  doc["transaction_type"] = type;
  doc["oil_ml_dispensed"] = oilMl;

  if (paymentAmt > 0) {
    doc["payment_amount"] = paymentAmt;
  }
  if (voucherCode && strlen(voucherCode) > 0) {
    doc["voucher_code"] = voucherCode;
  }

  ApiResponse response = _api->post("/api/device/transaction", doc);
  if (!response.success) {
    Serial.printf("[Transaction] Log failed: %s\n", response.errorMessage.c_str());
    return false;
  }

  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response.body);
  if (err) return false;

  bool ok = resDoc["success"] | false;
  if (ok) {
    float remaining = resDoc["oil_remaining_after"] | -1.0f;
    Serial.printf("[Transaction] Logged: type=%s ml=%.0f remaining=%.1fL\n",
                  type, oilMl, remaining);
  }
  return ok;
}

void SalesReporting::_enqueue(const SaleRecord& sale) {
  if (_queueCount >= OFFLINE_QUEUE_SIZE) {
    // Overwrite oldest entry (advance tail)
    Serial.println("[Sales] WARNING: Queue full, dropping oldest sale");
    _queueTail = (_queueTail + 1) % OFFLINE_QUEUE_SIZE;
    _queueCount--;
  }

  _queue[_queueHead] = sale;
  _queueHead = (_queueHead + 1) % OFFLINE_QUEUE_SIZE;
  _queueCount++;
}
