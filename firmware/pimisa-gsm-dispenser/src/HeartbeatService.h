// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// HeartbeatService.h - Periodic Device Status Reporting
//
// Sends device health data to the server at regular intervals
// via GSM HTTP POST. The server can respond with updated
// configuration (heartbeat interval, price per litre, etc.).
//
// Non-blocking: call update() every loop iteration.
// ============================================================
#pragma once
#include <Arduino.h>
#include "Config.h"

// Forward declarations
class GSMManager;
class FlowSensor;

// ============================================================
class HeartbeatService {
public:
    HeartbeatService();

    // Call once in setup()
    void begin();

    // Inject dependencies after construction
    void setDependencies(GSMManager* gsm, FlowSensor* flow);

    // Call every loop() - sends heartbeat when interval elapses
    void update();

    // Send a heartbeat immediately (bypasses interval timer)
    void forceSend();

    // ---- Data setters (called by main loop / other modules) ----
    void setOilLevelMl(float ml)         { _oilLevelMl = ml; }
    void setPumpCycles(uint32_t cycles)   { _pumpCycles = cycles; }
    void setTotalLitres(float l)          { _totalLitres = l; }

    // ---- Accessors ----
    unsigned long getInterval() const     { return _intervalMs; }
    unsigned long getLastSendMs() const   { return _lastSendMs; }
    bool isSending() const                { return _sending; }

private:
    // ---- Dependencies ----------------------------------------
    GSMManager*  _gsm;
    FlowSensor*  _flow;

    // ---- Telemetry data --------------------------------------
    float        _oilLevelMl;
    float        _totalLitres;
    uint32_t     _pumpCycles;

    // ---- Timing ----------------------------------------------
    unsigned long _intervalMs;      // Current heartbeat interval
    unsigned long _lastSendMs;      // millis() of last successful send
    bool          _sending;         // True while HTTP request in flight

    // ---- Internal helpers ------------------------------------
    void sendHeartbeat();
    void handleResponse(int statusCode, const String& body);
};
