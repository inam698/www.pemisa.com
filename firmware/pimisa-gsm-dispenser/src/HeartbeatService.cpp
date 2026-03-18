// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// HeartbeatService.cpp - Periodic Device Status Reporting
//
// Heartbeat JSON payload includes: device identity, uptime,
// signal quality, oil level, lifetime counters, and heap stats.
//
// The server response may contain updated configuration values
// (heartbeat interval, price per litre, admin messages).
// ============================================================
#include "HeartbeatService.h"
#include "GSMManager.h"
#include "FlowSensor.h"
#include "StorageManager.h"
#include <ArduinoJson.h>

static const char* TAG = "HB";

// Reference to the global StorageManager (declared in main.cpp)
extern StorageManager storage;

// ---- Constructor -------------------------------------------
HeartbeatService::HeartbeatService()
    : _gsm(nullptr),
      _flow(nullptr),
      _oilLevelMl(0.0f),
      _totalLitres(0.0f),
      _pumpCycles(0),
      _intervalMs(HEARTBEAT_INTERVAL),
      _lastSendMs(0),
      _sending(false)
{}

// ---- begin() -----------------------------------------------
void HeartbeatService::begin() {
    _lastSendMs = millis();   // Start counting from boot
    LOG(TAG, "HeartbeatService initialised");
    LOGF(TAG, "Interval: %lu ms", _intervalMs);
}

// ---- setDependencies() -------------------------------------
void HeartbeatService::setDependencies(GSMManager* gsm, FlowSensor* flow) {
    _gsm  = gsm;
    _flow  = flow;
    LOG(TAG, "Dependencies set");
}

// ---- update() - called every loop() -----------------------
void HeartbeatService::update() {
    if (!_gsm || _sending) return;

    unsigned long now = millis();

    // Handle millis() rollover gracefully
    if ((now - _lastSendMs) >= _intervalMs) {
        sendHeartbeat();
    }
}

// ---- forceSend() -------------------------------------------
void HeartbeatService::forceSend() {
    if (!_gsm || _sending) return;
    LOG(TAG, "Forced heartbeat requested");
    sendHeartbeat();
}

// ---- sendHeartbeat() - build JSON & fire HTTP POST ---------
void HeartbeatService::sendHeartbeat() {
    if (!_gsm->isReady()) {
        LOGF(TAG, "GSM not ready, skipping heartbeat (state: %s)", _gsm->getStateName());
        return;
    }

    // Sync oil level from FlowSensor if available
    if (_flow) {
        _oilLevelMl = _flow->getRemainingMl();
    }

    // ---- Build JSON payload --------------------------------
    StaticJsonDocument<384> doc;

    doc["device_id"]        = DEVICE_ID;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["hardware_version"] = HARDWARE_VERSION;
    doc["uptime_seconds"]   = millis() / 1000;
    doc["signal_quality"]   = _gsm->getSignalQuality();
    doc["oil_level_ml"]     = _oilLevelMl;
    doc["total_litres"]     = _totalLitres;
    doc["pump_cycles"]      = _pumpCycles;
    doc["free_heap"]        = ESP.getFreeHeap();
    doc["queue_size"]       = storage.getCount();

    String payload;
    serializeJson(doc, payload);

    LOGF(TAG, "Sending heartbeat (%u bytes)", payload.length());

    // ---- Build full URL ------------------------------------
    String url = String(API_USE_SSL ? "https://" : "http://") + API_HOST + API_ENDPOINT_HEARTBEAT;

    _sending = true;

    bool queued = _gsm->httpPost(url, payload, [this](HttpResponse& resp) {
        _sending = false;
        _lastSendMs = millis();

        if (resp.success) {
            LOGF(TAG, "Heartbeat OK (HTTP %d)", resp.statusCode);
            handleResponse(resp.statusCode, resp.body);
        } else {
            LOGF(TAG, "Heartbeat FAILED (HTTP %d)", resp.statusCode);
        }
    });

    if (!queued) {
        LOG(TAG, "GSM busy, heartbeat deferred");
        _sending = false;
    }
}

// ---- handleResponse() - parse server config updates --------
void HeartbeatService::handleResponse(int statusCode, const String& body) {
    if (body.length() == 0) return;

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
        LOGF(TAG, "JSON parse error: %s", err.c_str());
        return;
    }

    // ---- heartbeat_interval (server sends seconds) ---------
    if (doc.containsKey("heartbeat_interval")) {
        unsigned long newIntervalSec = doc["heartbeat_interval"].as<unsigned long>();
        unsigned long newIntervalMs  = newIntervalSec * 1000UL;

        if (newIntervalMs != _intervalMs && newIntervalMs >= 30000UL) {
            LOGF(TAG, "Interval updated: %lu -> %lu ms", _intervalMs, newIntervalMs);
            _intervalMs = newIntervalMs;
        }
    }

    // ---- price_per_litre -----------------------------------
    if (doc.containsKey("price_per_litre")) {
        float newPrice = doc["price_per_litre"].as<float>();
        float currentPrice = storage.loadPricePerLitre();

        if (abs(newPrice - currentPrice) > 0.01f && newPrice > 0.0f) {
            LOGF(TAG, "Price updated: %.2f -> %.2f", currentPrice, newPrice);
            storage.savePricePerLitre(newPrice);
        }
    }

    // ---- message (admin/server message) --------------------
    if (doc.containsKey("message")) {
        const char* msg = doc["message"].as<const char*>();
        if (msg && strlen(msg) > 0) {
            LOGF(TAG, "Server message: %s", msg);
        }
    }
}
