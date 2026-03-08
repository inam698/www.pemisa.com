/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - API Client Module              ║
 * ║                                                              ║
 * ║  HTTP client for communicating with Pimisa cloud server.    ║
 * ║  Handles authentication, retries, and JSON payloads.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef API_CLIENT_H
#define API_CLIENT_H

#include <Arduino.h>
#include <ArduinoJson.h>

// ─── API Response Structure ─────────────────────────────────────

struct ApiResponse {
  bool success;          // true if HTTP 2xx and valid JSON
  int httpCode;          // HTTP status code (0 = connection error)
  String body;           // Raw response body
  String errorMessage;   // Error description if !success
};

// ─── API Client Class ───────────────────────────────────────────

class ApiClient {
public:
  /**
   * Initialize the API client.
   * @param baseUrl   Server URL, e.g., "https://pimisa.example.com"
   * @param deviceId  Machine device ID, e.g., "DISP-A1B2-C3D4"
   * @param apiKey    Machine API key from admin dashboard
   */
  void begin(const char* baseUrl, const char* deviceId, const char* apiKey);

  /**
   * Send a POST request with JSON body.
   * @param endpoint  API path, e.g., "/api/voucher/verify"
   * @param payload   ArduinoJson document with request body
   * @return ApiResponse with results
   */
  ApiResponse post(const char* endpoint, const JsonDocument& payload);

  /**
   * Send a GET request.
   * @param endpoint  API path, e.g., "/api/machines/status"
   * @return ApiResponse with results
   */
  ApiResponse get(const char* endpoint);

  /** Set request timeout in milliseconds. */
  void setTimeout(unsigned long timeoutMs);

  /** Set retry configuration. */
  void setRetry(uint8_t maxRetries, unsigned long retryDelayMs);

private:
  String _baseUrl;
  String _deviceId;
  String _apiKey;
  unsigned long _timeoutMs = 10000;
  uint8_t _maxRetries = 3;
  unsigned long _retryDelayMs = 2000;

  ApiResponse _executeRequest(const char* method, const char* endpoint,
                               const String* body = nullptr);
};

#endif // API_CLIENT_H
