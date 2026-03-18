// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// KeypadManager.cpp - 4x4 Matrix Keypad Implementation
//
// Key handling:
//   - '0'-'9'  : Append digit to input buffer
//   - 'A'-'D'  : Mode select keys (forwarded via callback)
//   - '*'      : Backspace (remove last char, or clear if empty)
//   - '#'      : Confirm / submit buffer
//
// Buzzer feedback (short beep on each keypress) is driven
// from BUZZER_PIN when BUZZER_ENABLED is true.
// ============================================================
#include "KeypadManager.h"

// ---- File-local buzzer helper -------------------------------
// Provides tactile click feedback on every physical keypress.
// Kept as a free function since the header does not expose it.
static void buzzClick() {
    #if BUZZER_ENABLED
        digitalWrite(BUZZER_PIN, HIGH);
        delay(BUZZ_SHORT_MS);
        digitalWrite(BUZZER_PIN, LOW);
    #endif
}

// ---- Keypad layout ------------------------------------------
// Standard 4x4 membrane keypad layout
const char KeypadManager::_keys[KEYPAD_ROWS][KEYPAD_COLS] = {
    {'1', '2', '3', 'A'},
    {'4', '5', '6', 'B'},
    {'7', '8', '9', 'C'},
    {'*', '0', '#', 'D'}
};

byte KeypadManager::_rowPins[KEYPAD_ROWS] = {KP_R1, KP_R2, KP_R3, KP_R4};
byte KeypadManager::_colPins[KEYPAD_COLS] = {KP_C1, KP_C2, KP_C3, KP_C4};

// ---- Constructor --------------------------------------------
KeypadManager::KeypadManager()
    : _keypad(nullptr),
      _lastKeyMs(0),
      _enabled(true)
{}

// ---- begin() ------------------------------------------------
void KeypadManager::begin() {
    _keypad = new Keypad(
        makeKeymap(_keys),
        _rowPins,
        _colPins,
        KEYPAD_ROWS,
        KEYPAD_COLS
    );
    _keypad->setDebounceTime(KEYPAD_DEBOUNCE_MS);

    // Configure buzzer output
    #if BUZZER_ENABLED
        pinMode(BUZZER_PIN, OUTPUT);
        digitalWrite(BUZZER_PIN, LOW);
    #endif

    LOG("KPD", "Keypad initialized (4x4 matrix)");
    LOGF("KPD", "Rows: %d,%d,%d,%d  Cols: %d,%d,%d,%d",
         KP_R1, KP_R2, KP_R3, KP_R4,
         KP_C1, KP_C2, KP_C3, KP_C4);
}

// ---- update() -----------------------------------------------
void KeypadManager::update() {
    if (!_keypad) return;

    char key = _keypad->getKey();
    if (key == NO_KEY) return;

    _lastKeyMs = millis();
    LOGF("KPD", "Key pressed: %c", key);

    // Short audible click on every physical keypress
    buzzClick();

    if (!_enabled) {
        LOG("KPD", "Input disabled - key ignored");
        return;
    }

    // ---- '*' = Backspace ------------------------------------
    if (key == '*') {
        if (_inputBuffer.length() > 0) {
            _inputBuffer.remove(_inputBuffer.length() - 1);
            LOG("KPD", "Backspace");
        } else {
            // Buffer already empty - treat as full clear
            clearBuffer();
        }
        if (_keyPressCb) _keyPressCb(key);

    // ---- '#' = Confirm / Submit -----------------------------
    } else if (key == '#') {
        if (_inputBuffer.length() > 0) {
            LOGF("KPD", "Confirm: [%s]", _inputBuffer.c_str());
            if (_confirmCb) _confirmCb(_inputBuffer);
        } else {
            LOG("KPD", "Confirm pressed with empty buffer - ignored");
        }

    // ---- A-D = Mode select keys -----------------------------
    } else if (key >= 'A' && key <= 'D') {
        LOGF("KPD", "Mode key: %c", key);
        if (_keyPressCb) _keyPressCb(key);

    // ---- 0-9 = Digit entry ----------------------------------
    } else {
        if (_inputBuffer.length() < KEYPAD_MAX_LEN) {
            _inputBuffer += key;
            LOGF("KPD", "Buffer: [%s]", _inputBuffer.c_str());
            if (_keyPressCb) _keyPressCb(key);
        } else {
            LOG("KPD", "Buffer full - key ignored");
        }
    }
}

// ---- clearBuffer() ------------------------------------------
void KeypadManager::clearBuffer() {
    _inputBuffer = "";
    LOG("KPD", "Buffer cleared");
}

// ---- isIdle() -----------------------------------------------
bool KeypadManager::isIdle(unsigned long idleTimeoutMs) const {
    return (millis() - _lastKeyMs) > idleTimeoutMs;
}
