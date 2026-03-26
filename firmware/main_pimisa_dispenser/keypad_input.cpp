/**
 * keypad_input.cpp — Multi-tap text input implementation
 */

#include "keypad_input.h"

// ─── Character maps for each key ────────────────────────────────

static const char* MAP_1 = ".@_-1";
static const char* MAP_2 = "abc2";
static const char* MAP_3 = "def3";
static const char* MAP_4 = "ghi4";
static const char* MAP_5 = "jkl5";
static const char* MAP_6 = "mno6";
static const char* MAP_7 = "pqrs7";
static const char* MAP_8 = "tuv8";
static const char* MAP_9 = "wxyz9";
static const char* MAP_0 = " 0";

// ─── Public Methods ─────────────────────────────────────────────

void KeypadInput::begin(const char* label, uint8_t maxLen, bool masked) {
  _label = String(label);
  _maxLen = min(maxLen, (uint8_t)63);
  _masked = masked;
  _uppercase = false;
  _digitMode = false;
  _buffer = "";
  _lastKey = 0;
  _tapIndex = 0;
  _lastTapMs = 0;
  _cycling = false;
  _dirty = true;
}

KeypadInputResult KeypadInput::feedKey(char key) {
  if (key == '#') {
    // Confirm — commit any cycling char first
    if (_cycling) _commitCycling();
    return KI_CONFIRMED;
  }

  if (key == '*') {
    // Backspace
    if (_cycling) {
      // Cancel current cycling character
      _cycling = false;
      _lastKey = 0;
      _dirty = true;
      return KI_CONTINUE;
    }
    if (_buffer.length() > 0) {
      _buffer.remove(_buffer.length() - 1);
      _dirty = true;
      return KI_CONTINUE;
    }
    // Buffer empty — signal cancel
    return KI_CANCELLED;
  }

  if (key == 'A') {
    // Toggle case
    _uppercase = !_uppercase;
    // If cycling, update the displayed character
    if (_cycling) _dirty = true;
    return KI_CONTINUE;
  }

  if (key == 'B') {
    // Advance cursor — commit current cycling char
    if (_cycling) _commitCycling();
    return KI_CONTINUE;
  }

  if (key == 'D') {
    // Toggle digit mode
    if (_cycling) _commitCycling();
    _digitMode = !_digitMode;
    _dirty = true;
    return KI_CONTINUE;
  }

  // Digit keys 0-9
  if (key >= '0' && key <= '9') {
    if (_digitMode) {
      // Direct digit entry — no multi-tap
      if (_cycling) _commitCycling();
      if (_buffer.length() < _maxLen) {
        _buffer += key;
        _dirty = true;
      }
      return KI_CONTINUE;
    }

    // Multi-tap mode
    if (_cycling && key == _lastKey) {
      // Same key — cycle to next character
      const char* chars = _getCharsForKey(key);
      if (chars) {
        _tapIndex = (_tapIndex + 1) % strlen(chars);
        _lastTapMs = millis();
        _dirty = true;
      }
    } else {
      // Different key — commit previous cycling char and start new cycle
      if (_cycling) _commitCycling();

      if (_buffer.length() < _maxLen) {
        const char* chars = _getCharsForKey(key);
        if (chars && strlen(chars) > 0) {
          _lastKey = key;
          _tapIndex = 0;
          _lastTapMs = millis();
          _cycling = true;
          _dirty = true;
        }
      }
    }
    return KI_CONTINUE;
  }

  // C key — ignore (reserved for future use)
  return KI_CONTINUE;
}

void KeypadInput::tick() {
  if (_cycling && (millis() - _lastTapMs >= TAP_TIMEOUT_MS)) {
    _commitCycling();
  }
}

String KeypadInput::getText() const {
  return _buffer;
}

String KeypadInput::getLine0() const {
  // Top line: label + mode indicator
  String line = _label;
  if (_digitMode) {
    // Pad to show mode on the right
    while (line.length() < 13) line += ' ';
    line += "123";
  } else {
    while (line.length() < 13) line += ' ';
    line += (_uppercase ? "ABC" : "abc");
  }
  if (line.length() > 16) line = line.substring(0, 16);
  return line;
}

String KeypadInput::getLine1() const {
  // Bottom line: input text with cursor
  String display = "";

  if (_masked) {
    // Show asterisks for entered chars
    for (unsigned int i = 0; i < _buffer.length(); i++) {
      display += '*';
    }
  } else {
    display = _buffer;
  }

  // Add the currently cycling character (or cursor)
  if (_cycling) {
    const char* chars = _getCharsForKey(_lastKey);
    if (chars && _tapIndex < strlen(chars)) {
      char ch = chars[_tapIndex];
      if (_uppercase && ch >= 'a' && ch <= 'z') {
        ch = ch - 'a' + 'A';
      }
      if (_masked) {
        display += ch;  // Show current char briefly even in masked mode
      } else {
        display += ch;
      }
    }
  } else {
    display += '_';  // Cursor
  }

  // Pad to 16 chars to clear old text
  while (display.length() < 16) display += ' ';
  if (display.length() > 16) {
    // Scroll to show the end of long input
    display = display.substring(display.length() - 16);
  }
  return display;
}

bool KeypadInput::needsRedraw() {
  if (_dirty) {
    _dirty = false;
    return true;
  }
  return false;
}

// ─── Private Methods ────────────────────────────────────────────

void KeypadInput::_commitCycling() {
  if (!_cycling) return;

  const char* chars = _getCharsForKey(_lastKey);
  if (chars && _tapIndex < strlen(chars)) {
    char ch = chars[_tapIndex];
    if (_uppercase && ch >= 'a' && ch <= 'z') {
      ch = ch - 'a' + 'A';
    }
    _buffer += ch;
  }

  _cycling = false;
  _lastKey = 0;
  _tapIndex = 0;
  _dirty = true;
}

const char* KeypadInput::_getCharsForKey(char key) const {
  switch (key) {
    case '1': return MAP_1;
    case '2': return MAP_2;
    case '3': return MAP_3;
    case '4': return MAP_4;
    case '5': return MAP_5;
    case '6': return MAP_6;
    case '7': return MAP_7;
    case '8': return MAP_8;
    case '9': return MAP_9;
    case '0': return MAP_0;
    default:  return nullptr;
  }
}
