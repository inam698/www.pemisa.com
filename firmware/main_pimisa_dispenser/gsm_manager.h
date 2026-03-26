/**
 * PIMISA IoT OIL DISPENSER - GSM Manager Module (SIM800L)
 *
 * Handles GPRS connection via SIM800L using AT commands.
 * Drop-in replacement for WifiManager — same interface.
 * Auto-reconnects on disconnect with exponential backoff.
 */

#ifndef GSM_MANAGER_H
#define GSM_MANAGER_H

#include <Arduino.h>
#include <HardwareSerial.h>

// ─── GSM State ──────────────────────────────────────────────────

typedef enum {
  GSM_STATE_DISCONNECTED,
  GSM_STATE_CONNECTING,
  GSM_STATE_CONNECTED,
  GSM_STATE_FAILED
} GsmState;

class GsmManager {
public:
  /**
   * Initialize SIM800L module and establish GPRS connection.
   * Call once in setup().
   */
  void begin(uint8_t txPin, uint8_t rxPin, uint8_t rstPin,
             const char* apn, unsigned long timeoutMs = 30000);

  /**
   * Call in loop() to maintain GPRS connection.
   * Handles automatic reconnection.
   */
  void loop();

  /** Returns true if GPRS is connected and bearer is open. */
  bool isConnected() const;

  /** Returns current GSM state. */
  GsmState getState() const;

  /** Returns signal strength in dBm (from AT+CSQ). */
  int getRSSI() const;

  /** Force a reconnection attempt. */
  void reconnect();

  /**
   * Send an AT command and wait for expected response.
   * @param cmd      AT command string
   * @param expected Expected response substring (e.g., "OK")
   * @param timeout  Max wait time in ms
   * @return Full response string
   */
  String sendAT(const char* cmd, const char* expected = "OK",
                unsigned long timeout = 5000);

  /**
   * Perform an HTTP request via SIM800L AT+HTTP commands.
   * @param method   "GET" or "POST"
   * @param url      Full URL (http:// or https://)
   * @param body     POST body (nullptr for GET)
   * @param headers  Extra headers string (each ending with \r\n)
   * @param httpCode Output: HTTP status code
   * @return Response body string
   */
  String httpRequest(const char* method, const String& url,
                     const String* body = nullptr,
                     const String* headers = nullptr,
                     int* httpCode = nullptr);

private:
  HardwareSerial* _serial = nullptr;
  uint8_t _rstPin = 0;
  const char* _apn = nullptr;
  unsigned long _timeoutMs = 30000;
  unsigned long _lastAttemptMs = 0;
  unsigned long _reconnectDelay = 5000;
  unsigned long _maxReconnectDelay = 60000;
  GsmState _state = GSM_STATE_DISCONNECTED;
  uint8_t _retryCount = 0;
  int _rssi = -999;
  bool _bearerOpen = false;
  bool _moduleAbsent = false;  // True if no SIM800L detected at any baud rate

  bool _initModule();
  bool _waitForNetwork();
  bool _openBearer();
  void _closeBearer();
  void _hardReset();
  void _attemptConnection();
  void _updateRSSI();
  String _readResponse(const char* expected, unsigned long timeout);
};

#endif // GSM_MANAGER_H
