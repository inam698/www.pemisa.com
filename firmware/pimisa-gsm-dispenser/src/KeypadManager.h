// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// KeypadManager.h - 4x4 Matrix Keypad Input Handler
//
// Wraps the Keypad library with application-specific logic:
//   - Input buffer management (up to KEYPAD_MAX_LEN chars)
//   - '*' = backspace / clear
//   - '#' = confirm / submit
//   - Non-blocking (no delays)
//   - Idle timeout detection
//
// Keypad layout (standard 4x4):
//   1 2 3 A
//   4 5 6 B
//   7 8 9 C
//   * 0 # D
// ============================================================
#pragma once
#include <Arduino.h>
#include <Keypad.h>
#include "Config.h"

// Callback types
using KeyConfirmCallback = std::function<void(const String&)>;
using KeyCharCallback    = std::function<void(char)>;

class KeypadManager {
public:
    KeypadManager();

    // Call once in setup()
    void begin();

    // Call every loop() - polls keypad and fires callbacks
    void update();

    // Register callback when '#' is pressed (voucher code submitted)
    void onConfirm(KeyConfirmCallback cb) { _confirmCb = cb; }

    // Register callback for each character pressed (for display updates)
    void onKeyPress(KeyCharCallback cb) { _keyPressCb = cb; }

    // Get current input buffer
    const String& getBuffer() const { return _inputBuffer; }

    // Manually clear the input buffer
    void clearBuffer();

    // True if no key pressed for idleTimeoutMs
    bool isIdle(unsigned long idleTimeoutMs = IDLE_TIMEOUT_MS) const;

    // True if buffer has content and waiting for confirmation
    bool hasPendingInput() const { return _inputBuffer.length() > 0; }

    // Enable/disable input (disable during dispensing)
    void setEnabled(bool enabled) { _enabled = enabled; }

private:
    Keypad*            _keypad;
    String             _inputBuffer;
    KeyConfirmCallback _confirmCb;
    KeyCharCallback    _keyPressCb;
    unsigned long      _lastKeyMs;
    bool               _enabled;

    // Keypad layout definition
    static const char  _keys[KEYPAD_ROWS][KEYPAD_COLS];
    static byte        _rowPins[KEYPAD_ROWS];
    static byte        _colPins[KEYPAD_COLS];
};
