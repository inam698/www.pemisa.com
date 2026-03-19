// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// VoucherManager.cpp - Voucher Validation & Redemption Logic
//
// Async flow:
//   1. verify() checks NVS cache first, then fires HTTP POST
//   2. update() is a no-op (callback-driven via GSMManager)
//   3. hasResult() returns true once API or cache produces result
//   4. redeem() sends redemption or enqueues offline
//   5. processOfflineRedemptions() drains the offline queue
//
// NVS cache uses Preferences namespace "vcache".
// Each slot stores a CachedVoucher struct as raw bytes.
// Slot index = simple hash of voucher code % CACHE_MAX_ENTRIES.
// ============================================================
#include "VoucherManager.h"
#include "GSMManager.h"
#include "StorageManager.h"
#include <ArduinoJson.h>

// ============================================================
// Construction & Initialization
// ============================================================

VoucherManager::VoucherManager()
    : _gsm(nullptr),
      _storage(nullptr),
      _verifyState(VerifyState::IDLE),
      _result{},
      _retryBusy(false)
{}

void VoucherManager::begin() {
    _cache.begin("vcache", false);
    _verifyState = VerifyState::IDLE;
    memset(&_result, 0, sizeof(_result));
    LOG("VCHR", "VoucherManager initialized");
}

void VoucherManager::setGsm(GSMManager* gsm) {
    _gsm = gsm;
}

void VoucherManager::setStorage(StorageManager* storage) {
    _storage = storage;
}

// ============================================================
// update() - Called every loop iteration
// ============================================================
void VoucherManager::update() {
    // Async results are delivered via GSM HTTP callbacks.
    // No polling needed here.
}

// ============================================================
// verify() - Async Voucher Verification
// ============================================================
bool VoucherManager::verify(const String& phone, const String& code) {
    // Reset state
    _verifyState = VerifyState::IDLE;
    memset(&_result, 0, sizeof(_result));
    _verifyPhone = phone;
    _verifyCode  = code;

    // Store code in result for caller reference
    strncpy(_result.voucherCode, code.c_str(), sizeof(_result.voucherCode) - 1);

    // 1. Check NVS cache first
    if (findInCache(phone, code)) {
        LOGF("VCHR", "Cache hit for %s", code.c_str());
        _result.fromCache = true;
        _verifyState = VerifyState::HAS_RESULT;
        return true;
    }

    // 2. Try API if GSM is available
    if (_gsm && _gsm->isReady()) {
        LOGF("VCHR", "Cache miss - querying API for %s", code.c_str());

        // Build JSON body
        JsonDocument doc;
        doc["voucher_code"] = code;
        doc["device_id"]    = DEVICE_ID;

        String body;
        serializeJson(doc, body);

        String url = buildValidateUrl();

        bool posted = _gsm->httpPost(url, body, [this](HttpResponse& resp) {
            onValidateResponse(resp);
        });

        if (posted) {
            _verifyState = VerifyState::WAITING_API;
            return true;
        }

        // httpPost returned false (GSM busy) - fall through to offline
        LOG("VCHR", "GSM busy - cannot start verification");
    }

    // 3. No network and not in cache
    LOG("VCHR", "No network + cache miss -> verification failed");
    _result.valid = false;
    strncpy(_result.message, "No network", sizeof(_result.message) - 1);
    _verifyState = VerifyState::HAS_RESULT;
    return false;
}

// ============================================================
// onValidateResponse() - HTTP callback from GSMManager
// ============================================================
void VoucherManager::onValidateResponse(HttpResponse& resp) {
    LOGF("VCHR", "Validate response: %d | %s", resp.statusCode, resp.body.c_str());

    if (!resp.success || resp.body.length() == 0) {
        _result.valid = false;
        strncpy(_result.message, "Server error", sizeof(_result.message) - 1);
        _verifyState = VerifyState::HAS_RESULT;
        return;
    }

    // Parse JSON response
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, resp.body);
    if (err) {
        LOG("VCHR", "JSON parse error on validate response");
        _result.valid = false;
        strncpy(_result.message, "Parse error", sizeof(_result.message) - 1);
        _verifyState = VerifyState::HAS_RESULT;
        return;
    }

    // Expected: {status, litres, amount, beneficiary_name, message}
    const char* status = doc["status"] | "rejected";
    bool approved = (strcmp(status, "approved") == 0);

    _result.valid     = approved;
    _result.fromCache = false;
    _result.litres    = doc["litres"] | 0.0f;
    _result.amount    = doc["amount"] | 0.0f;

    const char* bName = doc["beneficiary_name"] | "";
    strncpy(_result.beneficiaryName, bName, sizeof(_result.beneficiaryName) - 1);

    const char* msg = doc["message"] | "";
    strncpy(_result.message, msg, sizeof(_result.message) - 1);

    // Cache approved vouchers for offline use
    if (approved) {
        saveToCache(_verifyPhone, _verifyCode,
                    _result.beneficiaryName, _result.litres, _result.amount);
        LOGF("VCHR", "Validated & cached: %s -> %.2fL %.2f ZMW",
             _verifyCode.c_str(), _result.litres, _result.amount);
    } else {
        LOGF("VCHR", "Rejected: %s -> %s", _verifyCode.c_str(), _result.message);
    }

    _verifyState = VerifyState::HAS_RESULT;
}

// ============================================================
// redeem() - Report Voucher Redemption
// ============================================================
bool VoucherManager::redeem(const String& code, float dispensedLitres) {
    LOGF("VCHR", "Redeem: %s, %.3f L", code.c_str(), dispensedLitres);

    // Build JSON body
    JsonDocument doc;
    doc["voucher_code"]    = code;
    doc["device_id"]       = DEVICE_ID;
    doc["litres_dispensed"] = dispensedLitres;
    doc["type"]            = "voucher";
    doc["phone"]           = _verifyPhone;
    doc["amount"]          = _result.amount;

    String body;
    serializeJson(doc, body);

    // Try sending online
    if (_gsm && _gsm->isReady()) {
        String url = buildRedeemUrl();

        bool posted = _gsm->httpPost(url, body, [this](HttpResponse& resp) {
            onRedeemResponse(resp);
        });

        if (posted) {
            LOG("VCHR", "Redemption sent to server");
            return true;
        }
    }

    // Offline: enqueue for later
    if (_storage) {
        OfflineTransaction txn = {};
        strncpy(txn.type, "voucher", sizeof(txn.type) - 1);
        strncpy(txn.voucherCode, code.c_str(), sizeof(txn.voucherCode) - 1);
        strncpy(txn.phone, _verifyPhone.c_str(), sizeof(txn.phone) - 1);
        txn.litresDispensed = dispensedLitres;
        txn.amount          = _result.amount;
        strncpy(txn.deviceId, DEVICE_ID, sizeof(txn.deviceId) - 1);
        txn.timestamp       = millis();
        txn.retryCount      = 0;

        if (_storage->enqueue(txn)) {
            LOGF("VCHR", "Redemption queued offline (%d in queue)",
                 _storage->getCount());
        } else {
            LOG("VCHR", "OFFLINE QUEUE FULL - redemption lost!");
        }
    }

    return false;
}

// ============================================================
// onRedeemResponse() - HTTP callback for redemption POST
// ============================================================
void VoucherManager::onRedeemResponse(HttpResponse& resp) {
    if (resp.success) {
        LOG("VCHR", "Redemption confirmed by server");
    } else {
        LOGF("VCHR", "Redemption POST failed: %d", resp.statusCode);
        // Transaction was already sent; server-side retry or
        // manual reconciliation may be needed.
    }
}

// ============================================================
// processOfflineRedemptions() - Drain Offline Queue
// ============================================================
void VoucherManager::processOfflineRedemptions() {
    if (!_gsm || !_gsm->isReady() || !_storage || _storage->isEmpty()) {
        return;
    }

    // Only one retry in-flight at a time
    if (_retryBusy) return;

    OfflineTransaction txn = {};
    if (!_storage->dequeue(txn)) return;

    LOGF("VCHR", "Retrying offline txn: %s (attempt %d)",
         txn.voucherCode, txn.retryCount + 1);

    // Build JSON from the queued transaction
    JsonDocument doc;
    doc["voucher_code"]     = txn.voucherCode;
    doc["device_id"]        = txn.deviceId;
    doc["litres_dispensed"]  = txn.litresDispensed;
    doc["type"]             = txn.type;
    doc["phone"]            = txn.phone;
    doc["amount"]           = txn.amount;

    String body;
    serializeJson(doc, body);

    String url = buildRedeemUrl();

    _retryBusy = true;
    bool posted = _gsm->httpPost(url, body, [this](HttpResponse& resp) {
        _retryBusy = false;
        if (resp.success) {
            LOG("VCHR", "Offline redemption sent successfully - removing from queue");
            if (_storage) _storage->remove();
        } else {
            LOGF("VCHR", "Offline redemption retry failed: %d", resp.statusCode);
            // Leave in queue for next retry cycle
        }
    });

    if (!posted) {
        _retryBusy = false;
        LOG("VCHR", "GSM busy - offline retry deferred");
    }
}

// ============================================================
// Cache Operations (Preferences namespace "vcache")
// ============================================================

// Simple hash: sum of char values mod CACHE_MAX_ENTRIES
uint8_t VoucherManager::cacheSlot(const String& code) const {
    uint32_t hash = 0;
    for (unsigned int i = 0; i < code.length(); i++) {
        hash += (uint8_t)code.charAt(i);
    }
    return (uint8_t)(hash % CACHE_MAX_ENTRIES);
}

String VoucherManager::cacheKey(uint8_t index) const {
    char buf[8];
    snprintf(buf, sizeof(buf), "vc%02u", index);
    return String(buf);
}

bool VoucherManager::findInCache(const String& phone, const String& code) {
    uint8_t slot = cacheSlot(code);
    String key = cacheKey(slot);

    CachedVoucher cv = {};
    size_t len = _cache.getBytes(key.c_str(), &cv, sizeof(cv));
    if (len != sizeof(cv)) return false;

    // Verify code matches (hash collision guard)
    if (strncmp(cv.code, code.c_str(), sizeof(cv.code)) != 0) return false;

    // Check TTL
    uint32_t age = millis() - cv.cachedAt;
    if (age > CACHE_TTL_MS) {
        LOGF("VCHR", "Cache expired for %s (age=%lu ms)", code.c_str(), (unsigned long)age);
        _cache.remove(key.c_str());
        return false;
    }

    // Populate result from cache
    _result.valid = true;
    _result.litres = cv.litres;
    _result.amount = cv.amount;
    strncpy(_result.beneficiaryName, cv.beneficiaryName, sizeof(_result.beneficiaryName) - 1);
    strncpy(_result.voucherCode, cv.code, sizeof(_result.voucherCode) - 1);
    strncpy(_result.message, "Cached", sizeof(_result.message) - 1);

    return true;
}

void VoucherManager::saveToCache(const String& phone, const String& code,
                                  const char* beneficiary, float litres, float amount) {
    uint8_t slot = cacheSlot(code);
    String key = cacheKey(slot);

    CachedVoucher cv = {};
    strncpy(cv.code, code.c_str(), sizeof(cv.code) - 1);
    strncpy(cv.phone, phone.c_str(), sizeof(cv.phone) - 1);
    strncpy(cv.beneficiaryName, beneficiary, sizeof(cv.beneficiaryName) - 1);
    cv.litres   = litres;
    cv.amount   = amount;
    cv.cachedAt = millis();

    _cache.putBytes(key.c_str(), &cv, sizeof(cv));
    LOGF("VCHR", "Saved to cache slot %d: %s", slot, code.c_str());
}

// ============================================================
// URL Builders
// ============================================================

String VoucherManager::buildValidateUrl() const {
    return String(API_USE_SSL ? "https://" : "http://") + API_HOST + API_ENDPOINT_VALIDATE;
}

String VoucherManager::buildRedeemUrl() const {
    return String(API_USE_SSL ? "https://" : "http://") + API_HOST + API_ENDPOINT_REDEEM;
}
