/**
 * offline_voucher_cache.cpp — Offline Voucher Cache implementation
 *
 * Uses ESP32 Preferences library (NVS wrapper).
 * Vouchers are stored as serialized structs keyed by index.
 * Linear scan for lookup (50 entries max — fast enough).
 *
 * Namespace: "vcache" — separate from main "pimisa" NVS namespace.
 */

#include "offline_voucher_cache.h"

// ─── Initialisation ─────────────────────────────────────────────

bool OfflineVoucherCache::begin(uint32_t ttlSeconds) {
  if (_initialized) return true;
  _ttlMs = ttlSeconds * 1000UL;
  _initialized = _prefs.begin("vcache", false);
  if (_initialized) {
    Serial.printf("[VCache] Initialized. Cached vouchers: %d\n", _count());
  } else {
    Serial.println("[VCache] Failed to initialize NVS namespace");
  }
  return _initialized;
}

// ─── Internal Helpers ───────────────────────────────────────────

int OfflineVoucherCache::_count() {
  return _prefs.getInt("vc_count", 0);
}

void OfflineVoucherCache::_setCount(int val) {
  _prefs.putInt("vc_count", val);
}

String OfflineVoucherCache::_entryKey(int index) {
  return "vc_" + String(index);
}

bool OfflineVoucherCache::_isExpired(const CachedVoucher& entry) {
  return (millis() - entry.cachedAt) > _ttlMs;
}

// ─── Cache Operations ───────────────────────────────────────────

bool OfflineVoucherCache::cacheVoucher(const char* voucherCode, const char* phone,
                                        float litres, float amount) {
  if (!_initialized) return false;

  // Check if already cached (update if so)
  int count = _count();
  for (int i = 0; i < count; i++) {
    CachedVoucher existing;
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &existing, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (strcmp(existing.voucherCode, voucherCode) == 0) {
        // Update existing entry
        existing.litres = litres;
        existing.amount = amount;
        existing.cachedAt = millis();
        existing.used = false;
        strncpy(existing.phone, phone, sizeof(existing.phone) - 1);
        existing.phone[sizeof(existing.phone) - 1] = '\0';
        _prefs.putBytes(key.c_str(), &existing, sizeof(CachedVoucher));
        Serial.printf("[VCache] Updated voucher %s in cache\n", voucherCode);
        return true;
      }
    }
  }

  // Evict expired entry or append
  int slot = -1;
  for (int i = 0; i < count && slot == -1; i++) {
    CachedVoucher temp;
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &temp, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (_isExpired(temp) || temp.used) {
        slot = i;
      }
    }
  }

  if (slot == -1) {
    if (count >= VOUCHER_CACHE_MAX_ENTRIES) {
      // Cache full, evict oldest (index 0)
      slot = 0;
    } else {
      slot = count;
      _setCount(count + 1);
    }
  }

  CachedVoucher entry;
  memset(&entry, 0, sizeof(entry));
  strncpy(entry.voucherCode, voucherCode, sizeof(entry.voucherCode) - 1);
  strncpy(entry.phone, phone, sizeof(entry.phone) - 1);
  entry.litres = litres;
  entry.amount = amount;
  entry.cachedAt = millis();
  entry.used = false;

  String key = _entryKey(slot);
  _prefs.putBytes(key.c_str(), &entry, sizeof(CachedVoucher));
  Serial.printf("[VCache] Cached voucher %s (%.2f L, %.0f KES) at slot %d\n",
                voucherCode, litres, amount, slot);
  return true;
}

bool OfflineVoucherCache::lookupVoucher(const char* phone, const char* voucherCode,
                                         CachedVoucher& result) {
  if (!_initialized) return false;

  int count = _count();
  for (int i = 0; i < count; i++) {
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &result, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (strcmp(result.voucherCode, voucherCode) == 0 &&
          strcmp(result.phone, phone) == 0 &&
          !result.used &&
          !_isExpired(result)) {
        Serial.printf("[VCache] HIT: voucher %s for %s (%.2f L)\n",
                      voucherCode, phone, result.litres);
        return true;
      }
    }
  }

  Serial.printf("[VCache] MISS: voucher %s for %s\n", voucherCode, phone);
  return false;
}

bool OfflineVoucherCache::markUsed(const char* voucherCode) {
  if (!_initialized) return false;

  int count = _count();
  for (int i = 0; i < count; i++) {
    CachedVoucher entry;
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &entry, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (strcmp(entry.voucherCode, voucherCode) == 0 && !entry.used) {
        entry.used = true;
        _prefs.putBytes(key.c_str(), &entry, sizeof(CachedVoucher));
        Serial.printf("[VCache] Marked voucher %s as used\n", voucherCode);
        return true;
      }
    }
  }
  return false;
}

int OfflineVoucherCache::getValidCount() {
  if (!_initialized) return 0;

  int valid = 0;
  int count = _count();
  for (int i = 0; i < count; i++) {
    CachedVoucher entry;
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &entry, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (!entry.used && !_isExpired(entry)) {
        valid++;
      }
    }
  }
  return valid;
}

void OfflineVoucherCache::pruneExpired() {
  if (!_initialized) return;

  int count = _count();
  int pruned = 0;
  for (int i = 0; i < count; i++) {
    CachedVoucher entry;
    String key = _entryKey(i);
    if (_prefs.getBytes(key.c_str(), &entry, sizeof(CachedVoucher)) == sizeof(CachedVoucher)) {
      if (_isExpired(entry)) {
        _prefs.remove(key.c_str());
        pruned++;
      }
    }
  }
  if (pruned > 0) {
    Serial.printf("[VCache] Pruned %d expired entries\n", pruned);
  }
}

void OfflineVoucherCache::clear() {
  if (!_initialized) return;

  int count = _count();
  for (int i = 0; i < count; i++) {
    _prefs.remove(_entryKey(i).c_str());
  }
  _setCount(0);
  Serial.println("[VCache] Cache cleared");
}
