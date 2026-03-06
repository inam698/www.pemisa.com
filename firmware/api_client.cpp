/**
 * API Client Implementation
 * Handles HTTP communication with Pimisa cloud server.
 * Includes retry logic with exponential backoff.
 */

#include "api_client.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ─── Public Methods ─────────────────────────────────────────────

void ApiClient::begin(const char* baseUrl, const char* deviceId, const char* apiKey) {
  _baseUrl = String(baseUrl);
  _deviceId = String(deviceId);
  _apiKey = String(apiKey);

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

// ─── Private Methods ────────────────────────────────────────────

ApiResponse ApiClient::_executeRequest(const char* method, const char* endpoint,
                                        const String* body) {
  ApiResponse response;
  response.success = false;
  response.httpCode = 0;

  if (WiFi.status() != WL_CONNECTED) {
    response.errorMessage = "WiFi not connected";
    Serial.println("[API] Error: WiFi not connected");
    return response;
  }

  String url = _baseUrl + String(endpoint);

  for (uint8_t attempt = 0; attempt <= _maxRetries; attempt++) {
    if (attempt > 0) {
      unsigned long delayMs = _retryDelayMs * (1 << (attempt - 1)); // Exponential backoff
      Serial.printf("[API] Retry %d/%d in %lums...\n", attempt, _maxRetries, delayMs);
      delay(delayMs);
    }

    HTTPClient http;
    WiFiClientSecure client;

    // For development, skip SSL verification.
    // In production, load the server's root CA certificate.
    client.setInsecure();

    Serial.printf("[API] %s %s", method, endpoint);
    if (attempt > 0) Serial.printf(" (attempt %d)", attempt + 1);
    Serial.println();

    if (!http.begin(client, url)) {
      response.errorMessage = "Failed to begin HTTP connection";
      Serial.printf("[API] Error: %s\n", response.errorMessage.c_str());
      continue;
    }

    http.setTimeout(_timeoutMs);

    // ── Set Headers ─────────────────────────────────────────────
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");
    http.addHeader("X-Device-ID", _deviceId);
    http.addHeader("X-API-Key", _apiKey);
    http.addHeader("User-Agent", "PimisaDispenser/" FIRMWARE_VERSION);

    // ── Execute Request ─────────────────────────────────────────
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

      Serial.printf("[API] Response: HTTP %d (%d bytes)\n",
                    httpCode, response.body.length());

      if (httpCode >= 200 && httpCode < 300) {
        response.success = true;
        response.errorMessage = "";
        http.end();
        return response;
      }

      // Parse error message from server response
      JsonDocument errorDoc;
      DeserializationError err = deserializeJson(errorDoc, response.body);
      if (err == DeserializationError::Ok) {
        const char* errMsg = errorDoc["error"] | errorDoc["message"] | "Unknown error";
        response.errorMessage = String(errMsg);
      } else {
        response.errorMessage = "HTTP " + String(httpCode);
      }

      // Don't retry on client errors (4xx) — only retry server errors (5xx)
      if (httpCode >= 400 && httpCode < 500) {
        Serial.printf("[API] Client error: %s\n", response.errorMessage.c_str());
        http.end();
        return response;
      }
    } else {
      response.errorMessage = "Connection failed: " + String(http.errorToString(httpCode));
      Serial.printf("[API] Connection error: %s\n", response.errorMessage.c_str());
    }

    http.end();
  }

  Serial.printf("[API] All %d attempts failed for %s\n", _maxRetries + 1, endpoint);
  return response;
}
