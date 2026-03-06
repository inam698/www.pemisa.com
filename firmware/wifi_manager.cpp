/**
 * WiFi Manager Implementation
 * Manages WiFi connection lifecycle with auto-reconnect.
 */

#include "wifi_manager.h"
#include "config.h"

// ─── Public Methods ─────────────────────────────────────────────

void WifiManager::begin(const char* ssid, const char* password, unsigned long timeoutMs) {
  _ssid = ssid;
  _password = password;
  _timeoutMs = timeoutMs;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  Serial.println("[WiFi] Initializing...");
  Serial.printf("[WiFi] SSID: %s\n", _ssid);

  _attemptConnection();
}

void WifiManager::loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (_state != WIFI_STATE_CONNECTED) {
      _state = WIFI_STATE_CONNECTED;
      _retryCount = 0;
      _reconnectDelay = WIFI_RECONNECT_INTERVAL;
      Serial.printf("[WiFi] Connected! IP: %s  RSSI: %ddBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    return;
  }

  // WiFi is disconnected - attempt reconnection with backoff
  if (_state == WIFI_STATE_CONNECTED) {
    _state = WIFI_STATE_DISCONNECTED;
    Serial.println("[WiFi] Connection lost. Will attempt reconnect...");
  }

  unsigned long now = millis();
  if (_state != WIFI_STATE_CONNECTING && (now - _lastAttemptMs >= _reconnectDelay)) {
    _attemptConnection();
  }
}

bool WifiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

WifiState WifiManager::getState() const {
  return _state;
}

String WifiManager::getIPAddress() const {
  if (WiFi.status() == WL_CONNECTED) {
    return WiFi.localIP().toString();
  }
  return "0.0.0.0";
}

int WifiManager::getRSSI() const {
  return WiFi.RSSI();
}

void WifiManager::reconnect() {
  WiFi.disconnect();
  _state = WIFI_STATE_DISCONNECTED;
  _lastAttemptMs = 0;
  _retryCount = 0;
  _reconnectDelay = WIFI_RECONNECT_INTERVAL;
}

// ─── Private Methods ────────────────────────────────────────────

void WifiManager::_attemptConnection() {
  _state = WIFI_STATE_CONNECTING;
  _lastAttemptMs = millis();
  _retryCount++;

  Serial.printf("[WiFi] Connecting (attempt %d)...\n", _retryCount);

  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(_ssid, _password);

  // Block for initial connection attempt up to timeout
  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < _timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    _state = WIFI_STATE_CONNECTED;
    _retryCount = 0;
    _reconnectDelay = WIFI_RECONNECT_INTERVAL;
    Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    _state = WIFI_STATE_FAILED;
    // Exponential backoff: 5s, 10s, 20s, 40s... max 60s
    _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
    Serial.printf("[WiFi] Failed. Next attempt in %lums\n", _reconnectDelay);
  }
}
