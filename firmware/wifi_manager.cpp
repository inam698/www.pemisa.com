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
  _retryCount = 0;

  Serial.println("[WiFi] Initializing...");
  Serial.printf("[WiFi] SSID: %s\n", _ssid);

  // ESP32 Arduino Core 3.x: Do NOT call WiFi.mode() explicitly.
  // The framework pre-creates the STA netif; calling WiFi.mode(WIFI_STA)
  // tries to re-create it, causing netstack error 12308.
  WiFi.setAutoReconnect(true);

  // Quick scan to verify target network is visible
  Serial.println("[WiFi] Scanning for networks...");
  int n = WiFi.scanNetworks();
  bool found = false;
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%d] %s (%ddBm) ch%d\n", i, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
    if (WiFi.SSID(i) == _ssid) found = true;
  }
  if (!found && n > 0) {
    Serial.printf("[WiFi] WARNING: '%s' not found in scan!\n", _ssid);
  }
  WiFi.scanDelete();

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
    _attemptConnection(false);  // Non-blocking reconnect in loop
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

void WifiManager::_attemptConnection(bool blocking) {
  _state = WIFI_STATE_CONNECTING;
  _lastAttemptMs = millis();
  _retryCount++;

  Serial.printf("[WiFi] Connecting (attempt %d, %s)...\n",
                _retryCount, blocking ? "blocking" : "non-blocking");

  // On retries, do a soft disconnect (no deinit) before reconnecting
  if (_retryCount > 1) {
    WiFi.disconnect();
    delay(200);
  }
  WiFi.begin(_ssid, _password);

  if (blocking) {
    // Block for initial connection attempt up to timeout (used in setup only)
    unsigned long startMs = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < _timeoutMs) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();
  }

  if (WiFi.status() == WL_CONNECTED) {
    _state = WIFI_STATE_CONNECTED;
    _retryCount = 0;
    _reconnectDelay = WIFI_RECONNECT_INTERVAL;
    Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else if (blocking) {
    // Only mark as failed immediately if we were blocking
    _state = WIFI_STATE_FAILED;
    _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
    Serial.printf("[WiFi] Failed. Next attempt in %lums\n", _reconnectDelay);
  } else {
    // Non-blocking: WiFi.begin() was called, connection happens in background.
    // Next loop() call will check WiFi.status() and update state.
    _state = WIFI_STATE_DISCONNECTED;
    _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
    Serial.printf("[WiFi] Reconnect initiated. Checking in %lums\n", _reconnectDelay);
  }
}
