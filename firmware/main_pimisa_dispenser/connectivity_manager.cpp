/**
 * connectivity_manager.cpp — Dual connectivity with automatic failover
 */

#include "connectivity_manager.h"
#include <esp_task_wdt.h>

// ─── Public Methods ─────────────────────────────────────────────

void ConnectivityManager::begin(NvsStorage* nvs) {
  _nvs = nvs;

  // Load preference from NVS
  _preference = (ConnPreference)_nvs->getConnPreference(DEFAULT_CONN_PREFERENCE);
  Serial.printf("[Conn] Preference: %s first\n",
                _preference == PREF_WIFI_FIRST ? "WiFi" : "GSM");

  // Load WiFi credentials from NVS (fall back to config.h defaults)
  _wifiSSID = _nvs->getWifiSSID(WIFI_SSID_DEFAULT);
  _wifiPassword = _nvs->getWifiPassword(WIFI_PASSWORD_DEFAULT);

  if (hasWifiCredentials()) {
    Serial.printf("[Conn] WiFi credentials loaded: SSID=%s\n", _wifiSSID.c_str());
  } else {
    Serial.println("[Conn] No WiFi credentials stored");
  }

  // ── Initialize based on preference order ──────────────────
  // Feed watchdog before each blocking init (WiFi=15s, GSM=30s)
  esp_task_wdt_reset();

  if (_preference == PREF_WIFI_FIRST) {
    // Try WiFi first
    #if WIFI_ENABLED
    if (hasWifiCredentials()) {
      Serial.println("[Conn] Trying preferred: WiFi...");
      _wifi.begin(_wifiSSID.c_str(), _wifiPassword.c_str(), WIFI_CONNECT_TIMEOUT_MS);
      _wifiInitialized = true;
    }
    #endif

    esp_task_wdt_reset();

    // If WiFi failed or no credentials, try GSM
    if (!_wifi.isConnected()) {
      #if GSM_ENABLED
      Serial.println("[Conn] Trying fallback: GSM...");
      _gsm.begin(GSM_TX_PIN, GSM_RX_PIN, GSM_RST_PIN, GSM_APN, GSM_CONNECT_TIMEOUT_MS);
      _gsmInitialized = true;
      #endif
    }
  } else {
    // Try GSM first
    #if GSM_ENABLED
    Serial.println("[Conn] Trying preferred: GSM...");
    _gsm.begin(GSM_TX_PIN, GSM_RX_PIN, GSM_RST_PIN, GSM_APN, GSM_CONNECT_TIMEOUT_MS);
    _gsmInitialized = true;
    #endif

    esp_task_wdt_reset();

    // If GSM failed, try WiFi
    if (!_gsm.isConnected()) {
      #if WIFI_ENABLED
      if (hasWifiCredentials()) {
        Serial.println("[Conn] Trying fallback: WiFi...");
        _wifi.begin(_wifiSSID.c_str(), _wifiPassword.c_str(), WIFI_CONNECT_TIMEOUT_MS);
        _wifiInitialized = true;
      }
      #endif
    }
  }

  esp_task_wdt_reset();
  _updateActive();
  Serial.printf("[Conn] Active transport: %s\n", getTransportName().c_str());
}

void ConnectivityManager::loop() {
  // Maintain both connections (non-blocking — their loop() handles reconnect)
  #if WIFI_ENABLED
  if (_wifiInitialized) {
    _wifi.loop();
  }
  #endif

  #if GSM_ENABLED
  if (_gsmInitialized) {
    _gsm.loop();
  }
  #endif

  // Periodic failover check
  unsigned long now = millis();
  if (now - _lastFailoverCheckMs >= FAILOVER_CHECK_INTERVAL) {
    _lastFailoverCheckMs = now;

    ConnTransport prev = _active;
    _updateActive();

    if (_active != prev) {
      Serial.printf("[Conn] Transport changed: %s -> %s\n",
                    prev == CONN_WIFI ? "WiFi" : (prev == CONN_GSM ? "GSM" : "None"),
                    getTransportName().c_str());
    }

    // If nothing connected and we have un-initialized transports, try them
    // (only once — set initialized flag so we don't block again)
    if (!isConnected()) {
      #if GSM_ENABLED
      if (!_gsmInitialized) {
        Serial.println("[Conn] No connection — initializing GSM...");
        esp_task_wdt_reset();
        _gsm.begin(GSM_TX_PIN, GSM_RX_PIN, GSM_RST_PIN, GSM_APN, GSM_CONNECT_TIMEOUT_MS);
        _gsmInitialized = true;
        esp_task_wdt_reset();
        _updateActive();
      }
      #endif
      #if WIFI_ENABLED
      if (!_wifiInitialized && hasWifiCredentials()) {
        Serial.println("[Conn] No connection — initializing WiFi...");
        esp_task_wdt_reset();
        _wifi.begin(_wifiSSID.c_str(), _wifiPassword.c_str(), WIFI_CONNECT_TIMEOUT_MS);
        _wifiInitialized = true;
        esp_task_wdt_reset();
        _updateActive();
      }
      #endif
    }
    // NOTE: If both are initialized but disconnected, their own loop()
    // methods handle reconnection with exponential backoff. We don't
    // re-call begin() — that would block and waste time.
  }
}

bool ConnectivityManager::isConnected() const {
  #if WIFI_ENABLED
  if (_wifiInitialized && _wifi.isConnected()) return true;
  #endif
  #if GSM_ENABLED
  if (_gsmInitialized && _gsm.isConnected()) return true;
  #endif
  return false;
}

ConnTransport ConnectivityManager::getActive() const {
  return _active;
}

int ConnectivityManager::getRSSI() const {
  if (_active == CONN_WIFI) return _wifi.getRSSI();
  if (_active == CONN_GSM)  return _gsm.getRSSI();
  return -999;
}

String ConnectivityManager::getTransportName() const {
  switch (_active) {
    case CONN_WIFI: return "WiFi";
    case CONN_GSM:  return "GSM";
    default:        return "None";
  }
}

// ─── Preference Management ──────────────────────────────────────

void ConnectivityManager::setPreference(ConnPreference pref) {
  _preference = pref;
  if (_nvs) _nvs->setConnPreference((int)pref);
  Serial.printf("[Conn] Preference set: %s first\n",
                pref == PREF_WIFI_FIRST ? "WiFi" : "GSM");
}

ConnPreference ConnectivityManager::getPreference() const {
  return _preference;
}

// ─── WiFi Credential Management ─────────────────────────────────

void ConnectivityManager::setWifiCredentials(const String& ssid, const String& password) {
  _wifiSSID = ssid;
  _wifiPassword = password;
  if (_nvs) {
    _nvs->setWifiSSID(ssid);
    _nvs->setWifiPassword(password);
  }
  Serial.printf("[Conn] WiFi credentials saved: SSID=%s\n", ssid.c_str());
}

String ConnectivityManager::getWifiSSID() const {
  return _wifiSSID;
}

bool ConnectivityManager::hasWifiCredentials() const {
  return _wifiSSID.length() > 0;
}

void ConnectivityManager::connectWifi() {
  #if WIFI_ENABLED
  if (!hasWifiCredentials()) {
    Serial.println("[Conn] No WiFi credentials configured");
    return;
  }

  esp_task_wdt_reset();

  if (_wifiInitialized) {
    // Already initialized — just trigger a reconnect (non-blocking)
    _wifi.reconnect();
    // Call begin again with new credentials if they changed
    _wifi.begin(_wifiSSID.c_str(), _wifiPassword.c_str(), WIFI_CONNECT_TIMEOUT_MS);
  } else {
    _wifi.begin(_wifiSSID.c_str(), _wifiPassword.c_str(), WIFI_CONNECT_TIMEOUT_MS);
    _wifiInitialized = true;
  }

  esp_task_wdt_reset();
  _updateActive();
  #endif
}

int ConnectivityManager::scanWifi(String* results, int* rssiOut, int maxResults) {
  #if WIFI_ENABLED
  Serial.println("[Conn] Scanning WiFi networks...");
  esp_task_wdt_reset();

  // WiFi.scanNetworks() can take several seconds
  int n = WiFi.scanNetworks();

  esp_task_wdt_reset();

  int count = min(n, maxResults);
  for (int i = 0; i < count; i++) {
    results[i] = WiFi.SSID(i);
    rssiOut[i] = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  Serial.printf("[Conn] Found %d networks\n", n);
  return count;
  #else
  return 0;
  #endif
}

// ─── Direct Access ──────────────────────────────────────────────

WifiManager* ConnectivityManager::wifi() { return &_wifi; }
GsmManager*  ConnectivityManager::gsm()  { return &_gsm; }

// ─── Private Methods ────────────────────────────────────────────

void ConnectivityManager::_updateActive() {
  // Preferred transport gets priority if both are connected
  if (_preference == PREF_WIFI_FIRST) {
    if (_wifiInitialized && _wifi.isConnected()) {
      _active = CONN_WIFI;
    } else if (_gsmInitialized && _gsm.isConnected()) {
      _active = CONN_GSM;
    } else {
      _active = CONN_NONE;
    }
  } else {
    if (_gsmInitialized && _gsm.isConnected()) {
      _active = CONN_GSM;
    } else if (_wifiInitialized && _wifi.isConnected()) {
      _active = CONN_WIFI;
    } else {
      _active = CONN_NONE;
    }
  }
}
