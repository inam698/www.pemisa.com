/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - Heartbeat Service Module       ║
 * ║                                                              ║
 * ║  Sends periodic heartbeat pings to the Pimisa cloud server  ║
 * ║  so the admin dashboard can track machine online/offline.   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef HEARTBEAT_SERVICE_H
#define HEARTBEAT_SERVICE_H

#include <Arduino.h>
#include "api_client.h"

class HeartbeatService {
public:
  /**
   * Initialize the heartbeat service.
   * @param apiClient      Initialized ApiClient instance
   * @param deviceId       This machine's device ID
   * @param intervalMs     Heartbeat interval (default 30s)
   */
  void begin(ApiClient* apiClient, const char* deviceId,
             unsigned long intervalMs = 30000);

  /**
   * Call in loop(). Sends heartbeat when interval elapsed.
   * Non-blocking — returns immediately if not yet time.
   */
  void loop();

  /**
   * Force an immediate heartbeat (e.g., after boot).
   */
  void sendNow();

  /** Returns true if last heartbeat was acknowledged by server. */
  bool isServerReachable() const;

  /** Returns uptime in seconds since boot. */
  unsigned long getUptimeSeconds() const;

  /** Returns number of consecutive failed heartbeats. */
  uint8_t getConsecutiveFailures() const;

  /** Set oil level reading (0-100%) from sensor. */
  void setOilLevel(float level);

  /** Set temperature reading (°C) from sensor. */
  void setTemperature(float temp);

  /** Increment pump cycle counter (call after each dispense). */
  void incrementPumpCycles();

  /** Set last voucher code dispensed. */
  void setLastVoucher(const String& code);

  /** Get current oil level. */
  float getOilLevel() const;

  /** Get current temperature. */
  float getTemperature() const;

  /** Get pump cycle count. */
  unsigned long getPumpCycles() const;

private:
  ApiClient* _api = nullptr;
  String _deviceId;
  unsigned long _intervalMs = 30000;
  unsigned long _lastSentMs = 0;
  unsigned long _bootTimeMs = 0;
  bool _serverReachable = false;
  uint8_t _consecutiveFailures = 0;

  // Sensor data for heartbeat payload
  float _oilLevel = -1.0f;
  float _temperature = -999.0f;
  unsigned long _pumpCycles = 0;
  String _lastVoucher = "";

  bool _sendHeartbeat();
};

#endif // HEARTBEAT_SERVICE_H
