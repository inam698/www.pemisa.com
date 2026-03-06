/**
 * ota_manager.h — Over-The-Air firmware update for ESP32
 *
 * Supports fleet-wide firmware distribution. Server pushes target version
 * during heartbeat response; device downloads + verifies + installs autonomously.
 *
 * SHA-256 checksum verification prevents corrupt/tampered firmware.
 * Rollback: ESP32 boot partition switches only on successful OTA write.
 */

#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include <Arduino.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include "config.h"

class OtaManager {
public:
  /**
   * Attempt an OTA update from the given URL.
   * @param url       HTTP(S) URL to the .bin firmware binary
   * @param version   Expected firmware version string (for logging)
   * @param checksum  Optional SHA-256 hex string to verify download integrity
   * @return true if OTA succeeded (device will reboot)
   */
  bool performUpdate(const String& url, const String& version, const String& checksum = "");

  /** Get the last error message after a failed update. */
  String getLastError() const { return _lastError; }

  /** Check if an OTA is currently in progress. */
  bool isUpdating() const { return _updating; }

private:
  String _lastError;
  bool _updating = false;
};

#endif // OTA_MANAGER_H
