/**
 * keypad_input.h — Multi-tap text input via 4x4 keypad on 16x2 LCD
 *
 * Phone-style multi-tap: press a key repeatedly to cycle through characters.
 * Example: press '2' once = 'a', twice = 'b', three times = 'c', four = '2'
 *
 * Key mapping:
 *   1 → . @ _ - 1    2 → a b c 2    3 → d e f 3
 *   4 → g h i 4      5 → j k l 5    6 → m n o 6
 *   7 → p q r s 7    8 → t u v 8    9 → w x y z 9
 *   0 → (space) 0
 *   * → backspace (if buffer empty → signals cancel)
 *   # → confirm/submit
 *   A → toggle UPPER/lower case
 *   B → advance cursor (commit current char)
 *   D → switch mode: ABC ↔ 123 (direct digit entry)
 */

#ifndef KEYPAD_INPUT_H
#define KEYPAD_INPUT_H

#include <Arduino.h>

// Result codes from feedKey()
enum KeypadInputResult {
  KI_CONTINUE,    // Still entering — display updated
  KI_CONFIRMED,   // User pressed # — input complete
  KI_CANCELLED,   // User pressed * with empty buffer — wants to go back
};

class KeypadInput {
public:
  /**
   * Start a new text input session.
   * @param label      Top-line label (e.g., "WiFi Password:")
   * @param maxLen     Maximum input length (capped at 63)
   * @param masked     If true, show asterisks instead of characters
   */
  void begin(const char* label, uint8_t maxLen = 32, bool masked = false);

  /**
   * Feed a keypad key press. Call this each time keypad.getKey() returns non-zero.
   * @param key  The key character ('0'-'9', 'A'-'D', '*', '#')
   * @return KI_CONTINUE, KI_CONFIRMED, or KI_CANCELLED
   */
  KeypadInputResult feedKey(char key);

  /**
   * Call periodically (e.g., every loop iteration) to handle multi-tap timeout.
   * Commits the current cycling character after 1.5s of no input.
   */
  void tick();

  /** Get the current input buffer. Only valid after KI_CONFIRMED. */
  String getText() const;

  /** Get display strings for LCD line 0 and line 1. */
  String getLine0() const;
  String getLine1() const;

  /** Returns true if the display needs to be refreshed. */
  bool needsRedraw();

private:
  String _label;
  String _buffer;
  uint8_t _maxLen;
  bool _masked;
  bool _uppercase;
  bool _digitMode;     // true = direct digit entry (no multi-tap)
  bool _dirty;         // display needs refresh

  // Multi-tap state
  char _lastKey;       // last key pressed for cycling
  uint8_t _tapIndex;   // current position in the character cycle
  unsigned long _lastTapMs;  // timestamp of last tap
  bool _cycling;       // true if currently cycling through chars

  static const unsigned long TAP_TIMEOUT_MS = 1500;

  void _commitCycling();
  const char* _getCharsForKey(char key) const;
};

#endif // KEYPAD_INPUT_H
