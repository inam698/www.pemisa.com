/**
 * ota_manager.h — Over-The-Air firmware update for ESP32
 *
 * NOTE: OTA over SIM800L GPRS is not supported due to bandwidth
 * and memory limitations. OTA requires WiFi connectivity.
 * This module is kept as a stub for API compatibility.
 */

#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include <Arduino.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include "config.h"

class OtaManager {
public:
  bool performUpdate(const String& url, const String& version, const String& checksum = "");
  String getLastError() const { return _lastError; }
  bool isUpdating() const { return _updating; }

private:
  String _lastError;
  bool _updating = false;
};

#endif // OTA_MANAGER_H
