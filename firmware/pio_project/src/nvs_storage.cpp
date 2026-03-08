/**
 * nvs_storage.cpp — Non-Volatile Storage implementation
 *
 * Uses ESP32 Preferences library (wrapper around NVS API).
 * Offline sales stored as a circular buffer of serialised structs.
 * At 100 sales × ~80 bytes = ~8KB — fits easily in NVS partition.
 *
 * Namespace: "pimisa" — isolates our data from other NVS users.
 */

#include "nvs_storage.h"

// ─── Initialisation ─────────────────────────────────────────────

bool NvsStorage::begin() {
  if (_initialized) return true;
  _initialized = _prefs.begin("pimisa", false); // read-write mode
  if (!_initialized) {
    Serial.println("[NVS] Failed to initialize NVS partition");
  } else {
    Serial.printf("[NVS] Initialized. Offline sales pending: %d\n", getOfflineSaleCount());
    Serial.printf("[NVS] Total dispensed: %.2f L, Pump cycles: %u\n",
                  getTotalDispensed(), getPumpCycles());
  }
  return _initialized;
}

// ─── Circular Buffer Helpers ────────────────────────────────────

int NvsStorage::_head()  { return _prefs.getInt("sq_head", 0); }
int NvsStorage::_tail()  { return _prefs.getInt("sq_tail", 0); }
int NvsStorage::_count() { return _prefs.getInt("sq_count", 0); }

void NvsStorage::_setHead(int val)  { _prefs.putInt("sq_head", val); }
void NvsStorage::_setTail(int val)  { _prefs.putInt("sq_tail", val); }
void NvsStorage::_setCount(int val) { _prefs.putInt("sq_count", val); }

String NvsStorage::_saleKey(int index) {
  return "sale_" + String(index);
}

// ─── Offline Sales Queue ────────────────────────────────────────

bool NvsStorage::pushOfflineSale(const OfflineSale& sale) {
  if (!_initialized) return false;

  int count = _count();
  if (count >= NVS_MAX_OFFLINE_SALES) {
    // Queue full — drop oldest
    Serial.println("[NVS] Queue full, dropping oldest sale");
    popOfflineSale();
  }

  int tail = _tail();
  String key = _saleKey(tail);

  // Serialize the struct to NVS as raw bytes
  size_t written = _prefs.putBytes(key.c_str(), &sale, sizeof(OfflineSale));
  if (written != sizeof(OfflineSale)) {
    Serial.println("[NVS] Failed to write offline sale");
    return false;
  }

  _setTail((tail + 1) % NVS_MAX_OFFLINE_SALES);
  _setCount(_count() + 1);

  Serial.printf("[NVS] Saved offline sale (%.2f L, %.0f KES). Queue: %d\n",
                sale.litres, sale.amount, _count());
  return true;
}

int NvsStorage::getOfflineSaleCount() {
  if (!_initialized) return 0;
  return _count();
}

bool NvsStorage::peekOfflineSale(OfflineSale& sale) {
  if (!_initialized || _count() == 0) return false;

  int head = _head();
  String key = _saleKey(head);

  size_t readBytes = _prefs.getBytes(key.c_str(), &sale, sizeof(OfflineSale));
  return readBytes == sizeof(OfflineSale);
}

bool NvsStorage::popOfflineSale() {
  if (!_initialized || _count() == 0) return false;

  int head = _head();
  String key = _saleKey(head);
  _prefs.remove(key.c_str());

  _setHead((head + 1) % NVS_MAX_OFFLINE_SALES);
  _setCount(_count() - 1);

  return true;
}

void NvsStorage::clearOfflineSales() {
  if (!_initialized) return;

  int count = _count();
  int head = _head();
  for (int i = 0; i < count; i++) {
    String key = _saleKey((head + i) % NVS_MAX_OFFLINE_SALES);
    _prefs.remove(key.c_str());
  }

  _setHead(0);
  _setTail(0);
  _setCount(0);

  Serial.println("[NVS] Cleared all offline sales");
}

// ─── Device Configuration ───────────────────────────────────────

void NvsStorage::setHeartbeatInterval(int seconds) {
  _prefs.putInt("hb_interval", seconds);
}

int NvsStorage::getHeartbeatInterval(int defaultVal) {
  return _prefs.getInt("hb_interval", defaultVal);
}

void NvsStorage::setPricePerLitre(float price) {
  _prefs.putFloat("price_litre", price);
}

float NvsStorage::getPricePerLitre(float defaultVal) {
  return _prefs.getFloat("price_litre", defaultVal);
}

void NvsStorage::setConfigVersion(int version) {
  _prefs.putInt("config_ver", version);
}

int NvsStorage::getConfigVersion(int defaultVal) {
  return _prefs.getInt("config_ver", defaultVal);
}

// ─── Lifetime Counters ──────────────────────────────────────────

void NvsStorage::addDispensedLitres(float litres) {
  float total = _prefs.getFloat("total_litres", 0.0f) + litres;
  _prefs.putFloat("total_litres", total);
}

float NvsStorage::getTotalDispensed() {
  return _prefs.getFloat("total_litres", 0.0f);
}

void NvsStorage::incrementPumpCycles() {
  uint32_t cycles = _prefs.getUInt("pump_cycles", 0) + 1;
  _prefs.putUInt("pump_cycles", cycles);
}

uint32_t NvsStorage::getPumpCycles() {
  return _prefs.getUInt("pump_cycles", 0);
}

void NvsStorage::incrementErrorCount() {
  uint32_t errors = _prefs.getUInt("error_count", 0) + 1;
  _prefs.putUInt("error_count", errors);
}

uint32_t NvsStorage::getErrorCount() {
  return _prefs.getUInt("error_count", 0);
}

void NvsStorage::resetErrorCount() {
  _prefs.putUInt("error_count", 0);
}

// ─── OTA State ──────────────────────────────────────────────────

void NvsStorage::setLastFirmwareVersion(const String& version) {
  _prefs.putString("fw_version", version);
}

String NvsStorage::getLastFirmwareVersion() {
  return _prefs.getString("fw_version", "");
}

void NvsStorage::setOtaRetryCount(int count) {
  _prefs.putInt("ota_retries", count);
}

int NvsStorage::getOtaRetryCount() {
  return _prefs.getInt("ota_retries", 0);
}
