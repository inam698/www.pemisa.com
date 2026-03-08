/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Heartbeat Service Impl         ║
 * ║                                                              ║
 * ║  Sends periodic heartbeat to /api/device/heartbeat          ║
 * ║  with device_id, oil_level, temperature, pump_cycles,       ║
 * ║  last_voucher, and firmware_version.                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include "heartbeat_service.h"
#include "config.h"
#include <ArduinoJson.h>

// ─── Public Methods ─────────────────────────────────────────────

void HeartbeatService::begin(ApiClient* apiClient, const char* deviceId,
                              unsigned long intervalMs) {
  _api = apiClient;
  _deviceId = String(deviceId);
  _intervalMs = intervalMs;
  _bootTimeMs = millis();
  _lastSentMs = 0;
  _serverReachable = false;
  _consecutiveFailures = 0;
  _oilLevel = -1.0f;
  _temperature = -999.0f;
  _pumpCycles = 0;
  _lastVoucher = "";

  Serial.printf("[Heartbeat] Initialized — interval: %lums\n", _intervalMs);
}

void HeartbeatService::loop() {
  unsigned long now = millis();

  // Handle millis() overflow gracefully
  if (now - _lastSentMs >= _intervalMs || _lastSentMs == 0) {
    _sendHeartbeat();
    _lastSentMs = now;
  }
}

void HeartbeatService::sendNow() {
  _sendHeartbeat();
  _lastSentMs = millis();
}

bool HeartbeatService::isServerReachable() const {
  return _serverReachable;
}

unsigned long HeartbeatService::getUptimeSeconds() const {
  return (millis() - _bootTimeMs) / 1000;
}

uint8_t HeartbeatService::getConsecutiveFailures() const {
  return _consecutiveFailures;
}

void HeartbeatService::setOilLevel(float level) {
  _oilLevel = constrain(level, 0.0f, 100.0f);
}

void HeartbeatService::setTemperature(float temp) {
  _temperature = temp;
}

void HeartbeatService::incrementPumpCycles() {
  _pumpCycles++;
}

void HeartbeatService::setLastVoucher(const String& code) {
  _lastVoucher = code;
}

float HeartbeatService::getOilLevel() const {
  return _oilLevel;
}

float HeartbeatService::getTemperature() const {
  return _temperature;
}

unsigned long HeartbeatService::getPumpCycles() const {
  return _pumpCycles;
}

// ─── Private Methods ────────────────────────────────────────────

bool HeartbeatService::_sendHeartbeat() {
  if (!_api) {
    Serial.println("[Heartbeat] Error: API client not initialized");
    return false;
  }

  JsonDocument doc;
  doc["device_id"] = _deviceId;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["uptime_seconds"] = getUptimeSeconds();

  // Include sensor data if available
  if (_oilLevel >= 0.0f) {
    doc["oil_level"] = _oilLevel;
  }
  if (_temperature > -999.0f) {
    doc["temperature"] = _temperature;
  }
  if (_pumpCycles > 0) {
    doc["pump_cycles"] = _pumpCycles;
  }
  if (_lastVoucher.length() > 0) {
    doc["last_voucher"] = _lastVoucher;
  }

  ApiResponse response = _api->post("/api/device/heartbeat", doc);

  if (response.success) {
    _serverReachable = true;
    _consecutiveFailures = 0;

    // Parse server response for config updates
    JsonDocument resDoc;
    DeserializationError err = deserializeJson(resDoc, response.body);
    if (err == DeserializationError::Ok) {
      const char* serverTime = resDoc["server_time"] | "";
      if (strlen(serverTime) > 0) {
        Serial.printf("[Heartbeat] OK — Server time: %s  Oil: %.1f%%  Temp: %.1f°C  Uptime: %lus\n",
                      serverTime, _oilLevel, _temperature, getUptimeSeconds());
      }

      // Apply server-controlled heartbeat interval
      int newInterval = resDoc["heartbeat_interval"] | 0;
      if (newInterval > 0) {
        unsigned long newMs = (unsigned long)newInterval * 1000;
        newMs = constrain(newMs, (unsigned long)MIN_HEARTBEAT_MS, (unsigned long)MAX_HEARTBEAT_MS);
        if (newMs != _intervalMs) {
          Serial.printf("[Heartbeat] Interval updated: %lums → %lums\n", _intervalMs, newMs);
          _intervalMs = newMs;
        }
      }
    }

    return true;
  }

  _serverReachable = false;
  _consecutiveFailures++;

  // Only log failures periodically to avoid flooding serial
  if (_consecutiveFailures <= 3 || _consecutiveFailures % 10 == 0) {
    Serial.printf("[Heartbeat] Failed (%d consecutive): %s\n",
                  _consecutiveFailures, response.errorMessage.c_str());
  }

  return false;
}
