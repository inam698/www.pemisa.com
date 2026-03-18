// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// FlowSensor.cpp - YF-S201 Flow Sensor Implementation
// ============================================================
#include "FlowSensor.h"

// Static member definition (shared between ISR and class)
volatile uint32_t FlowSensor::_pulseCount = 0;

// ---- ISR: Called on every rising edge of flow sensor output --
// IRAM_ATTR ensures this code is loaded in fast IRAM (not flash)
void IRAM_ATTR FlowSensor::pulseISR() {
    _pulseCount++;
}

// ---- Constructor ---------------------------------------------
FlowSensor::FlowSensor()
    : _volumeMl(0.0f),
      _flowRateMlSec(0.0f),
      _remainingMl(5000.0f),  // Default assumption: 5L tank
      _lastPulseCount(0),
      _lastUpdateMs(0),
      _lastFlowMs(0)
{}

// ---- begin() -------------------------------------------------
void FlowSensor::begin() {
    // Configure pin as input (use external pull-up if sensor is open-drain)
    pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);

    // Attach interrupt on rising edge
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN),
                    FlowSensor::pulseISR,
                    RISING);

    resetVolume();
    LOGF("FLOW", "Flow sensor init on pin %d", FLOW_SENSOR_PIN);
    LOGF("FLOW", "Calibration: %.1f pulses/L -> %.4f mL/pulse",
         FLOW_PULSES_PER_L, PULSE_TO_ML);
}

// ---- update() - Call every loop() ----------------------------
void FlowSensor::update() {
    unsigned long now = millis();

    // Calculate every 500ms to get stable flow rate
    if (now - _lastUpdateMs < 500) return;

    // Safely read volatile pulse count
    uint32_t currentPulses;
    noInterrupts();
    currentPulses = _pulseCount;
    interrupts();

    uint32_t deltaPulses = currentPulses - _lastPulseCount;

    if (deltaPulses > 0) {
        float deltaMs = (float)(now - _lastUpdateMs);

        // Convert pulses to volume
        float deltaMl = (float)deltaPulses * PULSE_TO_ML;
        _volumeMl    += deltaMl;
        _remainingMl -= deltaMl;
        if (_remainingMl < 0) _remainingMl = 0;

        // Flow rate = volume per second
        _flowRateMlSec = (deltaMl / deltaMs) * 1000.0f;
        _lastFlowMs    = now;

        LOGF("FLOW", "Pulses: +%lu | Vol: %.1f mL | Rate: %.1f mL/s | Remain: %.0f mL",
             deltaPulses, _volumeMl, _flowRateMlSec, _remainingMl);
    } else {
        // No flow - decay rate to zero after 1 second
        if (now - _lastFlowMs > 1000) {
            _flowRateMlSec = 0.0f;
        }
    }

    _lastPulseCount = currentPulses;
    _lastUpdateMs   = now;
}

// ---- resetVolume() ------------------------------------------
void FlowSensor::resetVolume() {
    noInterrupts();
    _pulseCount = 0;
    interrupts();
    _lastPulseCount = 0;
    _volumeMl       = 0.0f;
    _flowRateMlSec  = 0.0f;
    _lastUpdateMs   = millis();
    _lastFlowMs     = millis();
    LOG("FLOW", "Volume reset to 0");
}

// ---- hasFlowStopped() ---------------------------------------
bool FlowSensor::hasFlowStopped(unsigned long stopTimeoutMs) const {
    return (millis() - _lastFlowMs) > stopTimeoutMs;
}
