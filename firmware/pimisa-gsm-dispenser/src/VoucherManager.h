// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// VoucherManager.h - Voucher Validation & Redemption Manager
//
// Async voucher lifecycle:
//   verify()  -> polls hasResult() -> getResult()
//   redeem()  -> returns true (sent) or false (queued offline)
//   processOfflineRedemptions() -> retries queued redemptions
//
// Dependencies injected via setGsm() / setStorage() to avoid
// circular #include chains.
// ============================================================
#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include "Config.h"

// Forward declarations (no #include to avoid circular deps)
class GSMManager;
class StorageManager;
struct HttpResponse;

// ---- Voucher verification result ----------------------------
struct VoucherResult {
    bool  valid;
    bool  fromCache;
    float litres;
    float amount;
    char  beneficiaryName[50];
    char  voucherCode[16];
    char  message[80];
};

// ---- Cached voucher entry (stored in NVS) -------------------
struct CachedVoucher {
    char     code[16];
    char     phone[20];
    char     beneficiaryName[50];
    float    litres;
    float    amount;
    uint32_t cachedAt;          // millis() when cached
};

// ---- Async verification states ------------------------------
enum class VerifyState : uint8_t {
    IDLE,
    WAITING_API,
    HAS_RESULT
};

// ============================================================
class VoucherManager {
public:
    VoucherManager();

    // Call once in setup()
    void begin();

    // Inject dependencies (call after begin)
    void setGsm(GSMManager* gsm);
    void setStorage(StorageManager* storage);

    // Call every loop() - drives async state
    void update();

    // ---- Verification (async) --------------------------------

    // Start async voucher verification.
    // Returns true if the request was initiated (API or cache hit).
    // Returns false if unable to start (no network + no cache).
    bool verify(const String& phone, const String& code);

    // True when verify() has produced a result
    bool hasResult() const { return _verifyState == VerifyState::HAS_RESULT; }

    // Access the result (valid after hasResult() == true)
    const VoucherResult& getResult() const { return _result; }

    // ---- Redemption ------------------------------------------

    // Report a voucher redemption to the server.
    // Returns true if sent online, false if queued offline.
    bool redeem(const String& code, float dispensedLitres);

    // Retry queued offline redemptions (call from background tasks)
    void processOfflineRedemptions();

private:
    GSMManager*     _gsm;
    StorageManager* _storage;
    Preferences     _cache;

    VerifyState     _verifyState;
    VoucherResult   _result;

    // Current verification context
    String          _verifyPhone;
    String          _verifyCode;

    // Offline redemption retry state
    bool            _retryBusy;

    // ---- Cache operations ------------------------------------
    static constexpr uint8_t  CACHE_MAX_ENTRIES = 30;
    static constexpr uint32_t CACHE_TTL_MS      = 24UL * 60 * 60 * 1000;  // 24 hours

    bool findInCache(const String& phone, const String& code);
    void saveToCache(const String& phone, const String& code,
                     const char* beneficiary, float litres, float amount);
    String cacheKey(uint8_t index) const;
    uint8_t cacheSlot(const String& code) const;

    // ---- API helpers -----------------------------------------
    String buildValidateUrl() const;
    String buildRedeemUrl() const;
    void   onValidateResponse(HttpResponse& resp);
    void   onRedeemResponse(HttpResponse& resp);
};
