/**
 * connectivity_manager.h — Dual connectivity with automatic failover
 *
 * Wraps both WifiManager and GsmManager behind a single interface.
 * Automatically fails over between WiFi and GSM/SIM800L based on
 * availability and user preference (stored in NVS).
 *
 * Priority: preferred transport first, fallback to other if down.
 * WiFi is default preferred (faster, no data cost).
 */

#ifndef CONNECTIVITY_MANAGER_H
#define CONNECTIVITY_MANAGER_H

#include <Arduino.h>
#include "wifi_manager.h"
#include "gsm_manager.h"
#include "nvs_storage.h"
#include "config.h"

// ─── Transport & Preference Enums ───────────────────────────────

enum ConnTransport { CONN_NONE, CONN_WIFI, CONN_GSM };
enum ConnPreference { PREF_WIFI_FIRST = 0, PREF_GSM_FIRST = 1 };

class ConnectivityManager {
public:
  /**
   * Initialize both WiFi and GSM managers.
   * Loads WiFi credentials and preference from NVS.
   * Tries preferred transport first, then falls back.
   * @param nvs  Pointer to initialized NvsStorage
   */
  void begin(NvsStorage* nvs);

  /**
   * Call in loop() to maintain connections and handle failover.
   * Manages auto-reconnect for both transports.
   */
  void loop();

  /** Returns true if either WiFi or GSM is connected. */
  bool isConnected() const;

  /** Returns which transport is currently active. */
  ConnTransport getActive() const;

  /** Returns RSSI of the active transport. */
  int getRSSI() const;

  /** Short status string for LCD (e.g., "WiFi" or "GSM"). */
  String getTransportName() const;

  // ─── Preference Management ──────────────────────────────────

  void setPreference(ConnPreference pref);
  ConnPreference getPreference() const;

  // ─── WiFi Credential Management ─────────────────────────────

  /** Set new WiFi credentials and save to NVS. */
  void setWifiCredentials(const String& ssid, const String& password);

  /** Get the current WiFi SSID. */
  String getWifiSSID() const;

  /** Returns true if WiFi credentials are configured. */
  bool hasWifiCredentials() const;

  /** Trigger a WiFi connection attempt with current credentials. */
  void connectWifi();

  /**
   * Scan for nearby WiFi networks.
   * @param results    Array to fill with SSID names
   * @param rssiOut    Array to fill with RSSI values
   * @param maxResults Max entries to return
   * @return Number of networks found
   */
  int scanWifi(String* results, int* rssiOut, int maxResults);

  // ─── Direct Access ──────────────────────────────────────────

  WifiManager* wifi();
  GsmManager*  gsm();

private:
  WifiManager _wifi;
  GsmManager  _gsm;
  NvsStorage* _nvs = nullptr;

  ConnTransport _active = CONN_NONE;
  ConnPreference _preference = PREF_WIFI_FIRST;

  String _wifiSSID;
  String _wifiPassword;

  bool _wifiInitialized = false;
  bool _gsmInitialized = false;

  unsigned long _lastFailoverCheckMs = 0;
  static const unsigned long FAILOVER_CHECK_INTERVAL = 10000; // 10s

  void _updateActive();
};

#endif // CONNECTIVITY_MANAGER_H
