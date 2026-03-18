/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Offline Voucher Cache Module   ║
 * ║                                                              ║
 * ║  Caches recently verified vouchers in NVS so the device     ║
 * ║  can validate vouchers offline when the server is           ║
 * ║  unreachable. Entries expire after a configurable TTL.      ║
 * ║                                                              ║
 * ║  Storage: Each entry uses ~48 bytes in NVS. Max 50 entries  ║
 * ║  = ~2.4KB of flash. Combined with offline sales queue       ║
 * ║  (~8KB) this totals ~10KB of NVS usage — well within the   ║
 * ║  default 20KB NVS partition.                                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef OFFLINE_VOUCHER_CACHE_H
#define OFFLINE_VOUCHER_CACHE_H

#include <Arduino.h>
#include <Preferences.h>

// Maximum cached vouchers
#define VOUCHER_CACHE_MAX_ENTRIES 50

// Default TTL for cached vouchers (24 hours in seconds)
#define VOUCHER_CACHE_DEFAULT_TTL 86400

struct CachedVoucher {
  char voucherCode[16];  // 6-digit code + null terminator
  char phone[20];        // Phone number used for verification
  float litres;          // Entitled litres
  float amount;          // Monetary value
  uint32_t cachedAt;     // millis() when cached
  bool used;             // true if redeemed offline
};

class OfflineVoucherCache {
public:
  /**
   * Initialize the cache. Call once in setup().
   * @param ttlSeconds  How long cached vouchers remain valid (default: 24h)
   */
  bool begin(uint32_t ttlSeconds = VOUCHER_CACHE_DEFAULT_TTL);

  /**
   * Cache a verified voucher for offline use.
   * Called after a successful server verification.
   */
  bool cacheVoucher(const char* voucherCode, const char* phone,
                    float litres, float amount);

  /**
   * Look up a voucher in the cache.
   * Returns true if found AND not expired AND not already used.
   */
  bool lookupVoucher(const char* phone, const char* voucherCode,
                     CachedVoucher& result);

  /**
   * Mark a cached voucher as used (redeemed offline).
   * The actual server redemption happens when connectivity returns.
   */
  bool markUsed(const char* voucherCode);

  /**
   * Get number of cached (unexpired, unused) vouchers.
   */
  int getValidCount();

  /**
   * Remove expired entries to free NVS space.
   * Called periodically or after a successful server sync.
   */
  void pruneExpired();

  /**
   * Clear the entire cache.
   */
  void clear();

private:
  Preferences _prefs;
  bool _initialized = false;
  uint32_t _ttlMs;
  
  int _count();
  void _setCount(int val);
  String _entryKey(int index);
  bool _isExpired(const CachedVoucher& entry);
};

#endif // OFFLINE_VOUCHER_CACHE_H
