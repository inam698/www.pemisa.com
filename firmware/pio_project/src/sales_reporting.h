/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Sales Reporting Module         ║
 * ║                                                              ║
 * ║  Reports cash and voucher dispensing transactions to the    ║
 * ║  Pimisa cloud server. Supports offline queueing.           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef SALES_REPORTING_H
#define SALES_REPORTING_H

#include <Arduino.h>
#include "api_client.h"

// Maximum number of sales to queue offline before oldest is discarded
#define OFFLINE_QUEUE_SIZE 50

// ─── Sale Record ────────────────────────────────────────────────

struct SaleRecord {
  float litres;
  float amount;
  String paymentType;    // "cash" or "voucher"
  String voucherCode;    // Empty for cash sales
  String phone;          // Optional customer phone
  unsigned long timestamp;
  bool reported;         // true if successfully sent to server
};

// ─── Sales Reporting Class ──────────────────────────────────────

class SalesReporting {
public:
  /**
   * Initialize with a reference to the API client.
   * @param apiClient  Initialized ApiClient instance
   * @param deviceId   This machine's device ID
   * @param pricePerLitre  Configured price per litre in ZMW
   */
  void begin(ApiClient* apiClient, const char* deviceId, float pricePerLitre);

  /**
   * Report a cash sale transaction.
   * @param litres  Litres dispensed
   * @param amountPaid  Amount paid by customer in ZMW
   * @return true if reported successfully (or queued for later)
   */
  bool reportCashSale(float litres, float amountPaid);

  /**
   * Report a voucher sale transaction (use after voucher redeem succeeds).
   * @param litres  Litres dispensed
   * @param amount  Voucher value in ZMW
   * @param voucherCode  The voucher code used
   * @param phone  Customer phone number
   * @return true if reported successfully (or queued for later)
   */
  bool reportVoucherSale(float litres, float amount,
                         const char* voucherCode, const char* phone);

  /**
   * Convert cash amount to litres using current price.
   * @param amountZMW  Amount in ZMW
   * @return Litres that can be dispensed
   */
  float amountToLitres(float amountZMW) const;

  /**
   * Convert litres to cash amount.
   * @param litres  Litres
   * @return Amount in ZMW
   */
  float litresToAmount(float litres) const;

  /**
   * Update price per litre (e.g., from server config).
   * @param newPrice  New price in ZMW per litre
   */
  void setPricePerLitre(float newPrice);

  /** Returns current price per litre. */
  float getPricePerLitre() const;

  /**
   * Call periodically (e.g., in loop()) to retry sending
   * any queued offline sales.
   */
  void processOfflineQueue();

  /** Returns number of sales waiting in offline queue. */
  uint8_t getQueuedCount() const;

  /**
   * Send a unified transaction log to /api/device/transaction.
   * Called after every dispense to update inventory.
   * @param type        "voucher" or "purchase"
   * @param oilMl       Oil dispensed in millilitres
   * @param paymentAmt  Amount paid (0 for voucher)
   * @param voucherCode Voucher code (empty for purchase)
   * @return true if logged successfully
   */
  bool logTransaction(const char* type, float oilMl,
                      float paymentAmt, const char* voucherCode);

private:
  ApiClient* _api = nullptr;
  String _deviceId;
  float _pricePerLitre = 45.0f;

  // Offline queue (circular buffer)
  SaleRecord _queue[OFFLINE_QUEUE_SIZE];
  uint8_t _queueHead = 0;
  uint8_t _queueTail = 0;
  uint8_t _queueCount = 0;

  unsigned long _lastQueueRetryMs = 0;
  static const unsigned long QUEUE_RETRY_INTERVAL = 60000; // 1 minute

  bool _sendSaleReport(const SaleRecord& sale);
  bool _sendTransactionLog(const char* type, float oilMl,
                           float paymentAmt, const char* voucherCode);
  void _enqueue(const SaleRecord& sale);
};

#endif // SALES_REPORTING_H
