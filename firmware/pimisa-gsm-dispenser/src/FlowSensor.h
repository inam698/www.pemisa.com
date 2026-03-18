// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// FlowSensor.h - YF-S201 Flow Sensor Manager
//
// Uses hardware interrupt (ISR) for accurate pulse counting.
// Converts pulse count to volume (millilitres).
//
// Sensor spec (YF-S201):
//   - Flow rate: 1~30 L/min
//   - Pulses per litre: ~450 (calibrate per unit)
//   - Output: 5V square wave (voltage divider or level shifter
//     required to protect ESP32 3.3V GPIO)
//
// Non-blocking: call update() every loop, read volume/flow
// with getters. No blocking delays used.
// ============================================================
#pragma once
#include <Arduino.h>
#include "Config.h"

class FlowSensor {
public:
    FlowSensor();

    // Call once in setup()
    void begin();

    // Call every loop() - updates flow rate calculation
    void update();

    // Reset accumulated volume to zero (call at start of dispense)
    void resetVolume();

    // Current accumulated volume in millilitres
    float getVolumeMl() const { return _volumeMl; }

    // Current flow rate in mL/s (0 if no flow in last second)
    float getFlowRateMlPerSec() const { return _flowRateMlSec; }

    // Total pulse count since last reset
    volatile uint32_t getPulseCount() const { return _pulseCount; }

    // True if oil is flowing (flow rate > threshold)
    bool isFlowing() const { return _flowRateMlSec > 5.0f; }

    // True if flow has stopped for > stopTimeout ms
    bool hasFlowStopped(unsigned long stopTimeoutMs = 1000) const;

    // Estimated remaining oil in tank (rough approximation)
    // Requires calibration with known tank capacity
    float getRemainingMl() const { return _remainingMl; }
    void  setRemainingMl(float ml) { _remainingMl = ml; }
    void  decrementRemaining(float ml) { _remainingMl -= ml; if (_remainingMl < 0) _remainingMl = 0; }

    // ISR handler - must be public for the static ISR wrapper
    static void IRAM_ATTR pulseISR();

private:
    // Shared with ISR - must be volatile
    static volatile uint32_t _pulseCount;

    float         _volumeMl;          // Accumulated volume this session
    float         _flowRateMlSec;     // Instantaneous flow rate
    float         _remainingMl;       // Estimated tank remaining

    uint32_t      _lastPulseCount;    // Pulse count at last update
    unsigned long _lastUpdateMs;      // Time of last flow calculation
    unsigned long _lastFlowMs;        // Time of last detected pulse

    // Pulses-to-mL conversion factor (derived from Config)
    static constexpr float PULSE_TO_ML = 1000.0f / FLOW_PULSES_PER_L;
};
