// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// DisplayManager.h - I2C LCD 16x2 Display Manager
//
// Manages all LCD output with:
//   - Named screen modes (idle, input, dispensing, error, etc.)
//   - Non-blocking progress bar for dispensing
//   - Status line blinking for alerts
//   - Centralized message formatting
// ============================================================
#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "Config.h"

// ---- Screen modes -------------------------------------------
enum class DisplayMode : uint8_t {
    BOOT,
    IDLE,
    INPUT,
    VALIDATING,
    DISPENSING,
    COMPLETE,
    SENDING,
    ERROR,
    LOW_OIL,
    OFFLINE
};

class DisplayManager {
public:
    DisplayManager();

    // Call once in setup()
    void begin();

    // Call every loop() - handles blink and progress animations
    void update();

    // ---- Screen setters ------------------------------------
    void showBoot();
    void showIdle();
    void showInput(const String& maskedCode);
    void showValidating();
    void showDispensing(float currentMl, float targetMl);
    void showComplete(float dispensedMl);
    void showSending();
    void showError(const String& errorMsg);
    void showLowOil(float remainingMl);
    void showOfflineQueued(int queueSize);
    void showNetworkStatus(bool online, int signalQuality);

    // ---- Generic helpers -----------------------------------
    void showMessage(const String& line1, const String& line2 = "");

    // ---- Buzzer alerts -------------------------------------
    void beep(int durationMs = BUZZ_SHORT_MS);
    void beepError();
    void beepSuccess();

    DisplayMode getMode() const { return _mode; }

private:
    LiquidCrystal_I2C _lcd;
    DisplayMode       _mode;
    unsigned long     _lastUpdateMs;
    unsigned long     _modeEnterMs;
    bool              _blinkState;

    // Progress bar (16-char wide, chars 0-15)
    void drawProgressBar(int row, float percent);

    // Pad/truncate string to exactly LCD_COLS chars
    String padLine(const String& s) const;

    // Create custom characters
    void defineCustomChars();
};
