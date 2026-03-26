/**
 * GSM Manager Implementation (SIM800L)
 * Manages GPRS connection and HTTP requests via AT commands.
 */

#include "gsm_manager.h"
#include "config.h"
#include <esp_task_wdt.h>

// ─── Public Methods ─────────────────────────────────────────────

void GsmManager::begin(uint8_t txPin, uint8_t rxPin, uint8_t rstPin,
                       const char* apn, unsigned long timeoutMs) {
  _rstPin = rstPin;
  _apn = apn;
  _timeoutMs = timeoutMs;
  _retryCount = 0;

  // Use UART2 for SIM800L
  _serial = &Serial2;
  _serial->begin(GSM_BAUD, SERIAL_8N1, rxPin, txPin);

  // Configure reset pin
  pinMode(_rstPin, OUTPUT);
  digitalWrite(_rstPin, HIGH);

  Serial.println("[GSM] Initializing SIM800L...");

  _attemptConnection();
}

void GsmManager::loop() {
  if (_bearerOpen) {
    if (_state != GSM_STATE_CONNECTED) {
      _state = GSM_STATE_CONNECTED;
      _retryCount = 0;
      _reconnectDelay = GSM_RECONNECT_INTERVAL;
      Serial.println("[GSM] GPRS connected");
    }

    // Periodically check connection is still alive (every 60s to reduce blocking AT calls)
    static unsigned long lastCheck = 0;
    if (millis() - lastCheck > 60000) {
      lastCheck = millis();
      _updateRSSI();

      // Check bearer status
      String resp = sendAT("AT+SAPBR=2,1", "OK", 5000);
      if (resp.indexOf("0.0.0.0") >= 0 || resp.indexOf("+SAPBR: 1,3") >= 0) {
        // Bearer closed or deactivated — reset backoff so reconnect is immediate
        _bearerOpen = false;
        _state = GSM_STATE_DISCONNECTED;
        _reconnectDelay = GSM_RECONNECT_INTERVAL;
        _lastAttemptMs = 0;
        Serial.println("[GSM] Bearer lost. Will reconnect...");
      }
    }
    return;
  }

  // Disconnected — attempt reconnection with backoff
  if (_state == GSM_STATE_CONNECTED) {
    _state = GSM_STATE_DISCONNECTED;
    _reconnectDelay = GSM_RECONNECT_INTERVAL;  // Reset backoff for immediate retry
    _lastAttemptMs = 0;
    Serial.println("[GSM] Connection lost. Will attempt reconnect...");
  }

  unsigned long now = millis();
  if (_state != GSM_STATE_CONNECTING && (now - _lastAttemptMs >= _reconnectDelay)) {
    _attemptConnection();
  }
}

bool GsmManager::isConnected() const {
  return _bearerOpen && _state == GSM_STATE_CONNECTED;
}

GsmState GsmManager::getState() const {
  return _state;
}

int GsmManager::getRSSI() const {
  return _rssi;
}

void GsmManager::reconnect() {
  _closeBearer();
  _bearerOpen = false;
  _moduleAbsent = false;
  _state = GSM_STATE_DISCONNECTED;
  _lastAttemptMs = 0;
  _retryCount = 0;
  _reconnectDelay = GSM_RECONNECT_INTERVAL;
}

String GsmManager::sendAT(const char* cmd, const char* expected,
                           unsigned long timeout) {
  // Flush any pending data
  while (_serial->available()) _serial->read();

  _serial->println(cmd);
  Serial.printf("[GSM] >> %s\n", cmd);

  return _readResponse(expected, timeout);
}

String GsmManager::httpRequest(const char* method, const String& url,
                                const String* body, const String* headers,
                                int* httpCode) {
  String result = "";
  if (httpCode) *httpCode = 0;

  // Terminate any previous HTTP session
  sendAT("AT+HTTPTERM", "OK", 2000);
  delay(100);

  // Initialize HTTP
  if (sendAT("AT+HTTPINIT", "OK", 3000).indexOf("OK") < 0) {
    Serial.println("[GSM] HTTPINIT failed");
    return result;
  }

  // Set bearer profile
  sendAT("AT+HTTPPARA=\"CID\",1", "OK", 2000);

  // Set URL
  String urlCmd = "AT+HTTPPARA=\"URL\",\"" + url + "\"";
  sendAT(urlCmd.c_str(), "OK", 3000);

  // Set content type for POST
  if (strcmp(method, "POST") == 0) {
    sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);
  }

  // Set custom headers via USERDATA if provided
  if (headers != nullptr && headers->length() > 0) {
    String hdrCmd = "AT+HTTPPARA=\"USERDATA\",\"" + *headers + "\"";
    sendAT(hdrCmd.c_str(), "OK", 2000);
  }

  // Enable SSL for HTTPS
  if (url.startsWith("https")) {
    sendAT("AT+HTTPSSL=1", "OK", 2000);
  } else {
    sendAT("AT+HTTPSSL=0", "OK", 2000);
  }

  int code = 0;
  int dataLen = 0;

  if (strcmp(method, "POST") == 0 && body != nullptr) {
    // Upload POST data
    String dataCmd = "AT+HTTPDATA=" + String(body->length()) + ",10000";
    String resp = sendAT(dataCmd.c_str(), "DOWNLOAD", 5000);
    if (resp.indexOf("DOWNLOAD") >= 0) {
      _serial->print(*body);
      delay(100);
      _readResponse("OK", 10000);
    }

    // Execute POST
    String actionResp = sendAT("AT+HTTPACTION=1", "+HTTPACTION:", 30000);
    // Parse: +HTTPACTION: 1,<code>,<len>
    int idx = actionResp.indexOf("+HTTPACTION:");
    if (idx >= 0) {
      int comma1 = actionResp.indexOf(',', idx);
      int comma2 = actionResp.indexOf(',', comma1 + 1);
      if (comma1 > 0 && comma2 > 0) {
        code = actionResp.substring(comma1 + 1, comma2).toInt();
        dataLen = actionResp.substring(comma2 + 1).toInt();
      }
    }
  } else {
    // Execute GET
    String actionResp = sendAT("AT+HTTPACTION=0", "+HTTPACTION:", 30000);
    int idx = actionResp.indexOf("+HTTPACTION:");
    if (idx >= 0) {
      int comma1 = actionResp.indexOf(',', idx);
      int comma2 = actionResp.indexOf(',', comma1 + 1);
      if (comma1 > 0 && comma2 > 0) {
        code = actionResp.substring(comma1 + 1, comma2).toInt();
        dataLen = actionResp.substring(comma2 + 1).toInt();
      }
    }
  }

  if (httpCode) *httpCode = code;

  Serial.printf("[GSM] HTTP %d, %d bytes\n", code, dataLen);

  // Read response data
  if (dataLen > 0) {
    String readCmd = "AT+HTTPREAD=0," + String(dataLen);
    String readResp = sendAT(readCmd.c_str(), "OK", 10000);

    // Extract data between +HTTPREAD: <len>\r\n and \r\nOK
    int dataStart = readResp.indexOf("+HTTPREAD:");
    if (dataStart >= 0) {
      int nlAfterHeader = readResp.indexOf('\n', dataStart);
      if (nlAfterHeader >= 0) {
        int okPos = readResp.lastIndexOf("OK");
        if (okPos > nlAfterHeader) {
          result = readResp.substring(nlAfterHeader + 1, okPos);
          result.trim();
        } else {
          result = readResp.substring(nlAfterHeader + 1);
          result.trim();
        }
      }
    }
  }

  // Terminate HTTP session
  sendAT("AT+HTTPTERM", "OK", 2000);

  return result;
}

// ─── Private Methods ────────────────────────────────────────────

void GsmManager::_attemptConnection() {
  _state = GSM_STATE_CONNECTING;
  _lastAttemptMs = millis();
  _retryCount++;

  Serial.printf("[GSM] Connecting (attempt %d)...\n", _retryCount);

  // Hard reset on first attempt or after every 5th failure (was every 3rd — too aggressive)
  if (_retryCount == 1 || _retryCount % 5 == 0) {
    _hardReset();
  }

  // Initialize module
  if (!_initModule()) {
    _state = GSM_STATE_FAILED;
    if (_moduleAbsent) {
      // No hardware detected — wait 5 minutes before trying again
      _reconnectDelay = 300000;
      Serial.println("[GSM] Module not found. Next attempt in 5 minutes.");
    } else {
      _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
      Serial.printf("[GSM] Init failed. Next attempt in %lums\n", _reconnectDelay);
    }
    return;
  }
  _moduleAbsent = false;  // Module responded — clear absent flag

  // Wait for network registration
  if (!_waitForNetwork()) {
    _state = GSM_STATE_FAILED;
    _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
    Serial.printf("[GSM] Network failed. Next attempt in %lums\n", _reconnectDelay);
    return;
  }

  // Open GPRS bearer
  if (!_openBearer()) {
    _state = GSM_STATE_FAILED;
    _reconnectDelay = min(_reconnectDelay * 2, _maxReconnectDelay);
    Serial.printf("[GSM] Bearer failed. Next attempt in %lums\n", _reconnectDelay);
    return;
  }

  _bearerOpen = true;
  _state = GSM_STATE_CONNECTED;
  _retryCount = 0;
  _reconnectDelay = GSM_RECONNECT_INTERVAL;
  _updateRSSI();

  Serial.printf("[GSM] GPRS connected! RSSI: %ddBm\n", _rssi);
}

bool GsmManager::_initModule() {
  // Try default baud first, then one fallback
  const long baudRates[] = {GSM_BAUD, 115200};
  const int numBauds = 2;
  bool found = false;

  for (int b = 0; b < numBauds && !found; b++) {
    esp_task_wdt_reset();
    Serial.printf("[GSM] Trying baud %ld...\n", baudRates[b]);
    _serial->updateBaudRate(baudRates[b]);
    delay(100);

    for (int i = 0; i < 3; i++) {
      String resp = sendAT("AT", "OK", 1000);
      if (resp.indexOf("OK") >= 0) {
        Serial.printf("[GSM] Module responded at %ld baud\n", baudRates[b]);
        found = true;
        break;
      }
      delay(50);  // Reduced from 200ms — module responds quickly once powered
    }
  }

  if (!found) {
    _moduleAbsent = true;
    Serial.println("[GSM] ERROR: No response from SIM800L at any baud rate!");
    Serial.println("[GSM] Check wiring: ESP32 GPIO17(TX)->SIM800L RX, ESP32 GPIO16(RX)->SIM800L TX");
    Serial.println("[GSM] Check power: SIM800L needs 3.7-4.2V from LiPo, NOT ESP32 3.3V");
    return false;
  }

  // Disable echo
  sendAT("ATE0", "OK", 2000);

  // Check SIM card
  String simResp = sendAT("AT+CPIN?", "READY", 5000);
  if (simResp.indexOf("READY") < 0) {
    Serial.println("[GSM] SIM card not ready!");
    return false;
  }

  Serial.println("[GSM] SIM card OK");
  return true;
}

bool GsmManager::_waitForNetwork() {
  unsigned long start = millis();

  while (millis() - start < _timeoutMs) {
    esp_task_wdt_reset();  // Feed watchdog — network wait can take 30s
    String resp = sendAT("AT+CREG?", "+CREG:", 3000);
    // +CREG: 0,1 = registered home, +CREG: 0,5 = registered roaming
    if (resp.indexOf(",1") >= 0 || resp.indexOf(",5") >= 0) {
      Serial.println("[GSM] Registered on network");

      // Attach GPRS
      sendAT("AT+CGATT=1", "OK", 10000);
      delay(500);  // Reduced from 1000ms — modem is ready faster after CGATT
      return true;
    }

    Serial.println("[GSM] Waiting for network...");
    delay(1000);  // Reduced from 2000ms between network registration polls
  }

  Serial.println("[GSM] Network registration timeout");
  return false;
}

bool GsmManager::_openBearer() {
  // Close any existing bearer
  sendAT("AT+SAPBR=0,1", "OK", 3000);
  delay(200);  // Reduced from 500ms

  // Configure bearer: connection type = GPRS
  sendAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", "OK", 3000);

  // Set APN
  String apnCmd = String("AT+SAPBR=3,1,\"APN\",\"") + _apn + "\"";
  sendAT(apnCmd.c_str(), "OK", 3000);

  // Open bearer
  String resp = sendAT("AT+SAPBR=1,1", "OK", 15000);
  if (resp.indexOf("OK") < 0) {
    Serial.println("[GSM] Bearer open failed");
    return false;
  }

  delay(300);  // Reduced from 1000ms — IP assignment is fast once bearer opens

  // Check bearer status
  resp = sendAT("AT+SAPBR=2,1", "+SAPBR:", 5000);
  if (resp.indexOf("0.0.0.0") >= 0) {
    Serial.println("[GSM] No IP assigned");
    return false;
  }

  // Extract IP for logging
  int ipStart = resp.indexOf("\"");
  int ipEnd = resp.lastIndexOf("\"");
  if (ipStart >= 0 && ipEnd > ipStart) {
    Serial.printf("[GSM] IP: %s\n", resp.substring(ipStart + 1, ipEnd).c_str());
  }

  return true;
}

void GsmManager::_closeBearer() {
  sendAT("AT+HTTPTERM", "OK", 2000);
  sendAT("AT+SAPBR=0,1", "OK", 5000);
}

void GsmManager::_hardReset() {
  Serial.println("[GSM] Hard reset...");
  digitalWrite(_rstPin, LOW);
  delay(200);
  digitalWrite(_rstPin, HIGH);
  delay(2000);  // SIM800L boot time: min ~1.8s, 2s is safe (was 3s)
  esp_task_wdt_reset();
}

void GsmManager::_updateRSSI() {
  String resp = sendAT("AT+CSQ", "+CSQ:", 3000);
  int idx = resp.indexOf("+CSQ:");
  if (idx >= 0) {
    int comma = resp.indexOf(',', idx);
    if (comma > 0) {
      int csq = resp.substring(idx + 5, comma).toInt();
      if (csq == 99) {
        _rssi = -999;  // Unknown
      } else {
        _rssi = -113 + (csq * 2);  // Convert CSQ to dBm
      }
    }
  }
}

String GsmManager::_readResponse(const char* expected, unsigned long timeout) {
  String response = "";
  unsigned long start = millis();

  while (millis() - start < timeout) {
    while (_serial->available()) {
      char c = _serial->read();
      response += c;
    }

    if (expected && response.indexOf(expected) >= 0) {
      break;
    }

    // Also break on ERROR
    if (response.indexOf("ERROR") >= 0) {
      break;
    }

    delay(10);
  }

  if (response.length() > 0) {
    // Log response (truncated if too long)
    if (response.length() < 200) {
      Serial.printf("[GSM] << %s\n", response.c_str());
    } else {
      Serial.printf("[GSM] << (%d bytes)\n", response.length());
    }
  }

  return response;
}
