/**
 * ota_manager.cpp — Over-The-Air firmware update for ESP32
 *
 * Flow:
 * 1. Heartbeat response includes ota_update { version, url }
 * 2. Device compares version to FIRMWARE_VERSION
 * 3. Downloads binary via HTTP GET (chunked, ~4KB at a time)
 * 4. Writes to OTA partition via Update library
 * 5. Verifies SHA-256 checksum (if provided)
 * 6. Reboots into new firmware
 *
 * Safety: Update.begin() fails gracefully if partition is too small.
 * ESP32 dual-partition scheme means old firmware remains if OTA fails.
 */

#include "ota_manager.h"
#include <mbedtls/sha256.h>

bool OtaManager::performUpdate(const String& url, const String& version, const String& checksum) {
  if (_updating) {
    _lastError = "OTA already in progress";
    return false;
  }

  if (url.length() == 0) {
    _lastError = "Empty OTA URL";
    return false;
  }

  // Checksum is mandatory — refuse update without it
  if (checksum.length() != 64) {
    _lastError = "SHA-256 checksum required (64 hex chars). Got: " + String(checksum.length());
    Serial.printf("[OTA] REJECTED: Missing or invalid checksum\n");
    return false;
  }

  _updating = true;
  _lastError = "";

  Serial.println("[OTA] Starting firmware update...");
  Serial.printf("[OTA] Target version: %s\n", version.c_str());
  Serial.printf("[OTA] URL: %s\n", url.c_str());

  HTTPClient http;
  http.setTimeout(60000); // 60-second timeout for large binaries
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);

  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  bool useSSL = url.startsWith("https");

  if (useSSL) {
    #if SSL_VERIFY_SERVER
    secureClient.setCACert(ROOT_CA_CERT);
    #else
    secureClient.setInsecure();
    #endif
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }

  int httpCode = http.GET();

  if (httpCode != HTTP_CODE_OK) {
    _lastError = "HTTP GET failed, code: " + String(httpCode);
    Serial.printf("[OTA] %s\n", _lastError.c_str());
    http.end();
    _updating = false;
    return false;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    _lastError = "Invalid content length";
    Serial.printf("[OTA] %s\n", _lastError.c_str());
    http.end();
    _updating = false;
    return false;
  }

  Serial.printf("[OTA] Firmware size: %d bytes\n", contentLength);

  // Begin OTA update
  if (!Update.begin(contentLength)) {
    _lastError = "Not enough space for OTA: " + String(Update.errorString());
    Serial.printf("[OTA] %s\n", _lastError.c_str());
    http.end();
    _updating = false;
    return false;
  }

  // Stream firmware to flash in chunks, computing SHA-256 in parallel
  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[4096];
  int bytesWritten = 0;
  int lastProgress = -1;

  // Initialize SHA-256 context for integrity verification
  mbedtls_sha256_context sha256_ctx;
  mbedtls_sha256_init(&sha256_ctx);
  mbedtls_sha256_starts(&sha256_ctx, 0); // 0 = SHA-256 (not SHA-224)

  while (http.connected() && bytesWritten < contentLength) {
    int available = stream->available();
    if (available > 0) {
      int toRead = min(available, (int)sizeof(buf));
      int bytesRead = stream->readBytes(buf, toRead);
      if (bytesRead > 0) {
        // Update SHA-256 hash with this chunk
        mbedtls_sha256_update(&sha256_ctx, buf, bytesRead);

        size_t written = Update.write(buf, bytesRead);
        if (written != (size_t)bytesRead) {
          _lastError = "Write failed: " + String(Update.errorString());
          Serial.printf("[OTA] %s\n", _lastError.c_str());
          mbedtls_sha256_free(&sha256_ctx);
          Update.abort();
          http.end();
          _updating = false;
          return false;
        }
        bytesWritten += bytesRead;

        // Log progress every 10%
        int progress = (bytesWritten * 100) / contentLength;
        if (progress / 10 != lastProgress / 10) {
          lastProgress = progress;
          Serial.printf("[OTA] Progress: %d%%\n", progress);
        }
      }
    }
    delay(1); // Yield to watchdog
  }

  http.end();

  if (bytesWritten != contentLength) {
    _lastError = "Incomplete download: " + String(bytesWritten) + "/" + String(contentLength);
    Serial.printf("[OTA] %s\n", _lastError.c_str());
    mbedtls_sha256_free(&sha256_ctx);
    Update.abort();
    _updating = false;
    return false;
  }

  // Verify SHA-256 checksum before finalizing
  uint8_t hash[32];
  mbedtls_sha256_finish(&sha256_ctx, hash);
  mbedtls_sha256_free(&sha256_ctx);

  // Convert hash to hex string
  char hashHex[65];
  for (int i = 0; i < 32; i++) {
    sprintf(hashHex + (i * 2), "%02x", hash[i]);
  }
  hashHex[64] = '\0';

  Serial.printf("[OTA] Computed SHA-256: %s\n", hashHex);
  Serial.printf("[OTA] Expected SHA-256: %s\n", checksum.c_str());

  if (!checksum.equalsIgnoreCase(String(hashHex))) {
    _lastError = "Checksum mismatch! Firmware may be corrupt or tampered.";
    Serial.printf("[OTA] CRITICAL: %s\n", _lastError.c_str());
    Update.abort();
    _updating = false;
    return false;
  }

  Serial.println("[OTA] SHA-256 checksum verified OK");

  // Finalize the update
  if (!Update.end(true)) {
    _lastError = "Update finalization failed: " + String(Update.errorString());
    Serial.printf("[OTA] %s\n", _lastError.c_str());
    _updating = false;
    return false;
  }

  Serial.printf("[OTA] Update successful! Firmware %s written (%d bytes)\n",
                version.c_str(), bytesWritten);
  Serial.println("[OTA] Rebooting in 2 seconds...");

  _updating = false;

  // Give serial output time to flush
  delay(2000);
  ESP.restart();

  return true; // Won't actually reach here due to restart
}
