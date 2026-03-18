// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// PumpController.h - Pump Relay / MOSFET Controller
//
// Controls the oil pump via relay or N-channel MOSFET.
// Includes:
//   - Safety timeout (auto-shutoff after PUMP_MAX_ON_MS)
//   - Emergency stop
//   - Non-blocking state with millis()-based timing
//   - Configurable active-high or active-low polarity
// ============================================================
#pragma once
#include <Arduino.h>
#include "Config.h"

enum class PumpState : uint8_t {
    IDLE,
    RUNNING,
    STOPPED,
    ERROR_TIMEOUT    // Safety timeout triggered
};

class PumpController {
public:
    PumpController();

    // Call once in setup()
    void begin();

    // Call every loop() - handles safety timeout
    void update();

    // Start pumping. targetMl = 0 means run until stop() called.
    void start(float targetMl = 0.0f);

    // Stop pump immediately
    void stop();

    // Emergency stop (same as stop, but sets error flag)
    void emergencyStop();

    // Update dispensed volume (call with FlowSensor reading)
    void setDispensedMl(float ml);

    // True if pump is currently on
    bool isRunning() const { return _state == PumpState::RUNNING; }

    // True if target volume has been reached
    bool isTargetReached() const;

    // True if safety timeout was triggered
    bool isError() const { return _state == PumpState::ERROR_TIMEOUT; }

    // How long has pump been running (ms)
    unsigned long getRunTimeMs() const;

    // Get dispensed volume
    float getDispensedMl() const { return _dispensedMl; }

    // Get target volume
    float getTargetMl() const { return _targetMl; }

    // Reset error state
    void clearError();

    PumpState getState() const { return _state; }

private:
    PumpState     _state;
    float         _targetMl;       // 0 = no limit
    float         _dispensedMl;    // Updated externally from flow sensor
    unsigned long _startMs;        // When pump was last started
    bool          _active;         // Physical pin state

    void setPinState(bool on);
};
