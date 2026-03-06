/**
 * nvs_storage.h — Non-Volatile Storage for ESP32
 *
 * Persists critical data across power cycles / reboots:
 * - Offline sales queue (survives power outage at rural stations)
 * - Device configuration (server URL, heartbeat interval, price)
 * - OTA state (last successful version, retry count)
 * - Lifetime counter (total litres dispensed, pump cycles)
 *
 * Uses ESP32 NVS (Non-Volatile Storage) partition in flash.
 * Much more reliable than SPIFFS/LittleFS for key-value data.
 */

#ifndef NVS_STORAGE_H
#define NVS_STORAGE_H

#include <Arduino.h>
#include <Preferences.h>

// Maximum offline sales stored in NVS (each ~80 bytes → 8KB total)
#define NVS_MAX_OFFLINE_SALES 100

struct OfflineSale {
  float litres;
  float amount;
  char paymentType[8];   // "cash" or "voucher"
  char voucherCode[16];  // optional
  char phone[20];        // optional
  uint32_t timestamp;    // seconds since boot when sale occurred
};

class NvsStorage {
public:
  /** Initialize NVS partition. Call once in setup(). */
  bool begin();

  // ─── Offline Sales Queue ──────────────────────────────────

  /** Save an offline sale. Returns true if saved successfully. */
  bool pushOfflineSale(const OfflineSale& sale);

  /** Get the number of pending offline sales. */
  int getOfflineSaleCount();

  /** Peek at the oldest offline sale without removing it. */
  bool peekOfflineSale(OfflineSale& sale);

  /** Remove the oldest offline sale (after successful upload). */
  bool popOfflineSale();

  /** Clear all offline sales (e.g. after bulk upload). */
  void clearOfflineSales();

  // ─── Device Configuration ─────────────────────────────────

  /** Save server-pushed config values. */
  void setHeartbeatInterval(int seconds);
  int  getHeartbeatInterval(int defaultVal = 60);

  void setPricePerLitre(float price);
  float getPricePerLitre(float defaultVal = 45.0f);

  void setConfigVersion(int version);
  int  getConfigVersion(int defaultVal = 0);

  // ─── Lifetime Counters ────────────────────────────────────

  void addDispensedLitres(float litres);
  float getTotalDispensed();

  void incrementPumpCycles();
  uint32_t getPumpCycles();

  void incrementErrorCount();
  uint32_t getErrorCount();
  void resetErrorCount();

  // ─── OTA State ────────────────────────────────────────────

  void setLastFirmwareVersion(const String& version);
  String getLastFirmwareVersion();

  void setOtaRetryCount(int count);
  int  getOtaRetryCount();

private:
  Preferences _prefs;
  bool _initialized = false;

  // Circular buffer indices for offline sales
  int _head();
  int _tail();
  int _count();
  void _setHead(int val);
  void _setTail(int val);
  void _setCount(int val);
  String _saleKey(int index);
};

#endif // NVS_STORAGE_H
