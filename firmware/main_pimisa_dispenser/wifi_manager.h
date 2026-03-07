/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - WiFi Manager Module            ║
 * ║                                                              ║
 * ║  Handles WiFi connection, reconnection, and status.         ║
 * ║  Auto-reconnects on disconnect with exponential backoff.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>

// ─── WiFi State ─────────────────────────────────────────────────

typedef enum {
  WIFI_STATE_DISCONNECTED,
  WIFI_STATE_CONNECTING,
  WIFI_STATE_CONNECTED,
  WIFI_STATE_FAILED
} WifiState;

class WifiManager {
public:
  /**
   * Initialize WiFi in station mode.
   * Call once in setup().
   */
  void begin(const char* ssid, const char* password, unsigned long timeoutMs = 15000);

  /**
   * Call in loop() to maintain connection.
   * Handles automatic reconnection.
   */
  void loop();

  /** Returns true if WiFi is connected and has an IP address. */
  bool isConnected() const;

  /** Returns current WiFi state. */
  WifiState getState() const;

  /** Returns the local IP address as a string. */
  String getIPAddress() const;

  /** Returns WiFi signal strength in dBm. */
  int getRSSI() const;

  /** Force a reconnection attempt. */
  void reconnect();

private:
  const char* _ssid = nullptr;
  const char* _password = nullptr;
  unsigned long _timeoutMs = 15000;
  unsigned long _lastAttemptMs = 0;
  unsigned long _reconnectDelay = 5000;
  unsigned long _maxReconnectDelay = 60000;
  WifiState _state = WIFI_STATE_DISCONNECTED;
  uint8_t _retryCount = 0;

  void _attemptConnection();
};

#endif // WIFI_MANAGER_H
