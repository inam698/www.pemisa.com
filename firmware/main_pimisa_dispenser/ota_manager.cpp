/**
 * ota_manager.cpp — OTA stub for GSM-only firmware
 *
 * OTA firmware updates require WiFi for reliable large binary downloads.
 * SIM800L GPRS is too slow/unreliable for OTA. This stub returns false
 * so the system continues operating normally without OTA capability.
 */

#include "ota_manager.h"

bool OtaManager::performUpdate(const String& url, const String& version, const String& checksum) {
  _lastError = "OTA not supported over GSM/GPRS. Use WiFi for firmware updates.";
  Serial.println("[OTA] " + _lastError);
  return false;
}
