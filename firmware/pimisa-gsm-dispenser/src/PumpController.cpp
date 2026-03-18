// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// PumpController.cpp
// ============================================================
#include "PumpController.h"

PumpController::PumpController()
    : _state(PumpState::IDLE),
      _targetMl(0.0f),
      _dispensedMl(0.0f),
      _startMs(0),
      _active(false)
{}

void PumpController::begin() {
    pinMode(PUMP_PIN, OUTPUT);
    setPinState(false);   // Ensure pump is off at startup
    LOG("PUMP", "Pump controller init - pump OFF");
}

void PumpController::update() {
    if (_state != PumpState::RUNNING) return;

    // ---- Safety timeout check --------------------------------
    if (millis() - _startMs >= PUMP_MAX_ON_MS) {
        LOG("PUMP", "SAFETY TIMEOUT - forcing pump OFF");
        setPinState(false);
        _state = PumpState::ERROR_TIMEOUT;
        return;
    }

    // ---- Target volume check ---------------------------------
    if (_targetMl > 0.0f && _dispensedMl >= _targetMl) {
        LOG("PUMP", "Target volume reached - stopping pump");
        setPinState(false);
        _state = PumpState::STOPPED;
    }
}

void PumpController::start(float targetMl) {
    if (_state == PumpState::ERROR_TIMEOUT) {
        LOG("PUMP", "Cannot start - error state (call clearError first)");
        return;
    }
    _targetMl    = targetMl;
    _dispensedMl = 0.0f;
    _startMs     = millis();
    _state       = PumpState::RUNNING;
    setPinState(true);
    LOGF("PUMP", "Pump started. Target: %.1f mL, Timeout: %lu ms",
         targetMl, PUMP_MAX_ON_MS);
}

void PumpController::stop() {
    if (_state == PumpState::RUNNING) {
        setPinState(false);
        _state = PumpState::STOPPED;
        LOGF("PUMP", "Pump stopped. Dispensed: %.1f mL in %lu ms",
             _dispensedMl, millis() - _startMs);
    }
}

void PumpController::emergencyStop() {
    setPinState(false);
    _state = PumpState::ERROR_TIMEOUT;
    LOG("PUMP", "EMERGENCY STOP");
}

void PumpController::setDispensedMl(float ml) {
    _dispensedMl = ml;
}

bool PumpController::isTargetReached() const {
    return (_targetMl > 0.0f) && (_dispensedMl >= _targetMl);
}

unsigned long PumpController::getRunTimeMs() const {
    if (_state == PumpState::RUNNING) {
        return millis() - _startMs;
    }
    return 0;
}

void PumpController::clearError() {
    if (_state == PumpState::ERROR_TIMEOUT) {
        _state = PumpState::IDLE;
        LOG("PUMP", "Error cleared");
    }
}

void PumpController::setPinState(bool on) {
    _active = on;
    // Respect active-high vs active-low wiring
    digitalWrite(PUMP_PIN, (PUMP_ACTIVE_HIGH ? on : !on) ? HIGH : LOW);
    LOGF("PUMP", "Pin %d = %s", PUMP_PIN, on ? "ON" : "OFF");
}
