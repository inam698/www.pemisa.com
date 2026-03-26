/**
 * API Client Implementation — Dual Transport (WiFi + GSM)
 *
 * Routes HTTP requests through either WiFi (HTTPClient + WiFiClientSecure)
 * or GSM (SIM800L AT+HTTP commands) depending on active connectivity.
 * Includes retry logic with exponential backoff.
 */

#include "api_client.h"
#include "connectivity_manager.h"
#include "gsm_manager.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_task_wdt.h>

// ─── Public Methods ─────────────────────────────────────────────

void ApiClient::begin(const char* baseUrl, const char* deviceId,
                      const char* apiKey, ConnectivityManager* conn) {
  _baseUrl = String(baseUrl);
  _deviceId = String(deviceId);
  _apiKey = String(apiKey);
  _conn = conn;

  // Remove trailing slash if present
  if (_baseUrl.endsWith("/")) {
    _baseUrl.remove(_baseUrl.length() - 1);
  }

  Serial.printf("[API] Initialized — Server: %s  Device: %s\n",
                _baseUrl.c_str(), _deviceId.c_str());
}

ApiResponse ApiClient::post(const char* endpoint, const JsonDocument& payload) {
  String body;
  serializeJson(payload, body);
  return _executeRequest("POST", endpoint, &body);
}

ApiResponse ApiClient::get(const char* endpoint) {
  return _executeRequest("GET", endpoint);
}

void ApiClient::setTimeout(unsigned long timeoutMs) {
  _timeoutMs = timeoutMs;
}

void ApiClient::setRetry(uint8_t maxRetries, unsigned long retryDelayMs) {
  _maxRetries = maxRetries;
  _retryDelayMs = retryDelayMs;
}

// ─── Private: Request Router ────────────────────────────────────

ApiResponse ApiClient::_executeRequest(const char* method, const char* endpoint,
                                        const String* body) {
  ApiResponse response;
  response.success = false;
  response.httpCode = 0;

  if (!_conn || !_conn->isConnected()) {
    response.errorMessage = "No connection";
    Serial.println("[API] Error: No connection available");
    return response;
  }

  String url = _baseUrl + String(endpoint);
  ConnTransport transport = _conn->getActive();

  for (uint8_t attempt = 0; attempt <= _maxRetries; attempt++) {
    if (attempt > 0) {
      unsigned long delayMs = _retryDelayMs * (1 << (attempt - 1));
      Serial.printf("[API] Retry %d/%d in %lums...\n", attempt, _maxRetries, delayMs);
      delay(delayMs);

      // Re-check connectivity — transport may have switched during delay
      if (!_conn->isConnected()) {
        response.errorMessage = "Connection lost during retry";
        Serial.println("[API] Connection lost during retry");
        return response;
      }
      transport = _conn->getActive();
    }

    Serial.printf("[API] %s %s via %s", method, endpoint,
                  transport == CONN_WIFI ? "WiFi" : "GSM");
    if (attempt > 0) Serial.printf(" (attempt %d)", attempt + 1);
    Serial.println();

    // Route to appropriate transport
    if (transport == CONN_WIFI) {
      response = _executeViaWifi(method, url, body);
    } else if (transport == CONN_GSM) {
      response = _executeViaGsm(method, url, body);
    } else {
      response.errorMessage = "No transport available";
      return response;
    }

    // Success
    if (response.success) return response;

    // Don't retry on client errors (4xx)
    if (response.httpCode >= 400 && response.httpCode < 500) {
      Serial.printf("[API] Client error: %s\n", response.errorMessage.c_str());
      return response;
    }
  }

  Serial.printf("[API] All %d attempts failed for %s\n", _maxRetries + 1, endpoint);
  return response;
}

// ─── Private: WiFi Transport ────────────────────────────────────

ApiResponse ApiClient::_executeViaWifi(const char* method, const String& url,
                                        const String* body) {
  ApiResponse response;
  response.success = false;
  response.httpCode = 0;

  HTTPClient http;
  WiFiClientSecure client;

  #if SSL_VERIFY_SERVER
  client.setCACert(ROOT_CA_CERT);
  #else
  client.setInsecure();
  #endif

  client.setTimeout(15);  // 15 second SSL handshake timeout

  Serial.printf("[API] WiFi connecting to: %s\n", url.c_str());

  if (!http.begin(client, url)) {
    response.errorMessage = "Failed to begin HTTP connection";
    return response;
  }

  http.setTimeout(_timeoutMs);

  // Set headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Device-ID", _deviceId);
  http.addHeader("X-API-Key", _apiKey);
  http.addHeader("User-Agent", "PimisaDispenser/" FIRMWARE_VERSION);

  // Execute request
  int httpCode;
  if (strcmp(method, "POST") == 0 && body != nullptr) {
    httpCode = http.POST(*body);
  } else if (strcmp(method, "GET") == 0) {
    httpCode = http.GET();
  } else {
    http.end();
    response.errorMessage = "Unsupported HTTP method";
    return response;
  }

  response.httpCode = httpCode;

  if (httpCode > 0) {
    response.body = http.getString();
    Serial.printf("[API] WiFi response: HTTP %d (%d bytes)\n",
                  httpCode, response.body.length());

    if (httpCode >= 200 && httpCode < 300) {
      response.success = true;
      response.errorMessage = "";
    } else {
      // Parse error message
      JsonDocument errorDoc;
      DeserializationError err = deserializeJson(errorDoc, response.body);
      if (err == DeserializationError::Ok) {
        const char* errMsg = errorDoc["error"] | errorDoc["message"] | "Unknown error";
        response.errorMessage = String(errMsg);
      } else {
        response.errorMessage = "HTTP " + String(httpCode);
      }
    }
  } else {
    response.errorMessage = "Connection failed: " + String(http.errorToString(httpCode));
    Serial.printf("[API] WiFi error: %s\n", response.errorMessage.c_str());
  }

  http.end();
  return response;
}

// ─── Private: GSM Transport ─────────────────────────────────────

ApiResponse ApiClient::_executeViaGsm(const char* method, const String& url,
                                       const String* body) {
  ApiResponse response;
  response.success = false;
  response.httpCode = 0;

  GsmManager* gsm = _conn->gsm();
  if (!gsm || !gsm->isConnected()) {
    response.errorMessage = "GSM not connected";
    return response;
  }

  // Build headers string for SIM800L USERDATA
  String headers = "X-Device-ID: " + _deviceId +
                   "\r\nX-API-Key: " + _apiKey +
                   "\r\nUser-Agent: PimisaDispenser/" FIRMWARE_VERSION +
                   "\r\nAccept: application/json";

  int httpCode = 0;
  String respBody = gsm->httpRequest(method, url, body, &headers, &httpCode);

  response.httpCode = httpCode;
  response.body = respBody;

  if (httpCode > 0) {
    Serial.printf("[API] GSM response: HTTP %d (%d bytes)\n",
                  httpCode, respBody.length());

    if (httpCode >= 200 && httpCode < 300) {
      response.success = true;
      response.errorMessage = "";
    } else {
      JsonDocument errorDoc;
      DeserializationError err = deserializeJson(errorDoc, response.body);
      if (err == DeserializationError::Ok) {
        const char* errMsg = errorDoc["error"] | errorDoc["message"] | "Unknown error";
        response.errorMessage = String(errMsg);
      } else {
        response.errorMessage = "HTTP " + String(httpCode);
      }
    }
  } else {
    response.errorMessage = "GSM HTTP request failed";
    Serial.println("[API] GSM error");
  }

  return response;
}
