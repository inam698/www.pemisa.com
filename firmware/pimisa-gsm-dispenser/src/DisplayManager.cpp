// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// DisplayManager.cpp - I2C LCD 16x2 Display Implementation
//
// Non-blocking LCD driver that avoids I2C bus congestion by
// rate-limiting writes to DISPLAY_UPDATE_MS intervals.
//
// Custom character slots:
//   0 = Full block   (progress bar fill)
//   1 = Half block   (progress bar partial)
//   2 = Drop icon    (oil drop)
//   3 = Check icon   (tick mark)
//   4 = Warning icon (exclamation)
//   5 = Signal icon  (antenna bars)
// ============================================================
#include "DisplayManager.h"

// ---- Custom character bitmaps (5x8 pixels) ------------------
static uint8_t charFull[8]   = {0x1F,0x1F,0x1F,0x1F,0x1F,0x1F,0x1F,0x1F};
static uint8_t charHalf[8]   = {0x10,0x10,0x10,0x10,0x10,0x10,0x10,0x10};
static uint8_t charDrop[8]   = {0x04,0x04,0x0E,0x0E,0x1F,0x1F,0x0E,0x00};
static uint8_t charCheck[8]  = {0x00,0x01,0x03,0x16,0x1C,0x08,0x00,0x00};
static uint8_t charWarn[8]   = {0x04,0x0E,0x0E,0x0E,0x1F,0x00,0x04,0x00};
static uint8_t charSignal[8] = {0x00,0x01,0x03,0x07,0x0F,0x1F,0x00,0x00};

// Custom character slot indices
#define CC_FULL     0
#define CC_HALF     1
#define CC_DROP     2
#define CC_CHECK    3
#define CC_WARN     4
#define CC_SIGNAL   5

// ---- Constructor --------------------------------------------
DisplayManager::DisplayManager()
    : _lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS),
      _mode(DisplayMode::BOOT),
      _lastUpdateMs(0),
      _modeEnterMs(0),
      _blinkState(false)
{}

// ---- begin() ------------------------------------------------
void DisplayManager::begin() {
    // Initialize I2C on configured pins
    Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);

    _lcd.init();
    _lcd.backlight();
    defineCustomChars();

    // Configure buzzer output
    #if BUZZER_ENABLED
        pinMode(BUZZER_PIN, OUTPUT);
        digitalWrite(BUZZER_PIN, LOW);
    #endif

    showBoot();
    LOG("LCD", "Display initialized (16x2 I2C)");
    LOGF("LCD", "Address: 0x%02X  SDA=%d SCL=%d", LCD_ADDRESS, LCD_SDA_PIN, LCD_SCL_PIN);
}

// ---- defineCustomChars() ------------------------------------
void DisplayManager::defineCustomChars() {
    _lcd.createChar(CC_FULL,   charFull);
    _lcd.createChar(CC_HALF,   charHalf);
    _lcd.createChar(CC_DROP,   charDrop);
    _lcd.createChar(CC_CHECK,  charCheck);
    _lcd.createChar(CC_WARN,   charWarn);
    _lcd.createChar(CC_SIGNAL, charSignal);
}

// ---- update() - Non-blocking refresh loop -------------------
void DisplayManager::update() {
    unsigned long now = millis();

    // Rate-limit LCD writes to avoid I2C bus congestion
    if (now - _lastUpdateMs < DISPLAY_UPDATE_MS) return;
    _lastUpdateMs = now;

    // Toggle blink state for animated elements
    _blinkState = !_blinkState;

    // Animate blinking cursor in IDLE mode
    if (_mode == DisplayMode::IDLE) {
        _lcd.setCursor(15, 1);
        _lcd.print(_blinkState ? ">" : " ");
    }
}

// ============================================================
// Screen Setters
// ============================================================

// ---- showBoot() ---------------------------------------------
void DisplayManager::showBoot() {
    _mode        = DisplayMode::BOOT;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print("  PIMISA  OIL   ");
    _lcd.setCursor(0, 1);
    _lcd.print(" DISPENSER v");
    _lcd.print(FIRMWARE_VERSION);
    beep(BUZZ_SHORT_MS);
    LOG("LCD", "Screen: BOOT");
}

// ---- showIdle() ---------------------------------------------
void DisplayManager::showIdle() {
    _mode        = DisplayMode::IDLE;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print("Enter voucher:  ");
    _lcd.setCursor(0, 1);
    _lcd.print("                ");
    LOG("LCD", "Screen: IDLE");
}

// ---- showInput() --------------------------------------------
void DisplayManager::showInput(const String& maskedCode) {
    // Only clear screen on first transition to INPUT mode
    if (_mode != DisplayMode::INPUT) {
        _mode        = DisplayMode::INPUT;
        _modeEnterMs = millis();
        _lcd.clear();
        _lcd.setCursor(0, 0);
        _lcd.print("Voucher code:   ");
        LOG("LCD", "Screen: INPUT");
    }

    // Show entered digits with trailing cursor indicator
    String display = maskedCode;
    display += "_";
    _lcd.setCursor(0, 1);
    _lcd.print(padLine(display));
}

// ---- showValidating() ---------------------------------------
void DisplayManager::showValidating() {
    _mode        = DisplayMode::VALIDATING;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print("Validating...   ");
    _lcd.setCursor(0, 1);
    _lcd.write(CC_SIGNAL);
    _lcd.print(" Please wait    ");
    LOG("LCD", "Screen: VALIDATING");
}

// ---- showDispensing() ---------------------------------------
void DisplayManager::showDispensing(float currentMl, float targetMl) {
    // Transition once; subsequent calls only update data lines
    if (_mode != DisplayMode::DISPENSING) {
        _mode        = DisplayMode::DISPENSING;
        _modeEnterMs = millis();
        _lcd.clear();
        LOG("LCD", "Screen: DISPENSING");
    }

    // Line 1: drop icon + volume counter
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "%cDisp:%4.0f/%4.0fmL",
             (char)CC_DROP, currentMl, targetMl);
    _lcd.setCursor(0, 0);
    _lcd.print(buf);

    // Line 2: progress bar
    float pct = (targetMl > 0.0f)
                ? constrain(currentMl / targetMl, 0.0f, 1.0f)
                : 0.0f;
    drawProgressBar(1, pct);
}

// ---- showComplete() -----------------------------------------
void DisplayManager::showComplete(float dispensedMl) {
    _mode        = DisplayMode::COMPLETE;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "%c Done! %5.0f mL", (char)CC_CHECK, dispensedMl);
    _lcd.print(buf);
    _lcd.setCursor(0, 1);
    _lcd.print("Thank you!      ");
    beepSuccess();
    LOGF("LCD", "Screen: COMPLETE (%.0f mL)", dispensedMl);
}

// ---- showSending() ------------------------------------------
void DisplayManager::showSending() {
    _mode        = DisplayMode::SENDING;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print("Sending data... ");
    _lcd.setCursor(0, 1);
    _lcd.write(CC_SIGNAL);
    _lcd.print(" Uploading...  ");
    LOG("LCD", "Screen: SENDING");
}

// ---- showError() --------------------------------------------
void DisplayManager::showError(const String& errorMsg) {
    _mode        = DisplayMode::ERROR;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "%c ERROR!         ", (char)CC_WARN);
    _lcd.print(buf);
    _lcd.setCursor(0, 1);
    _lcd.print(padLine(errorMsg));
    beepError();
    LOGF("LCD", "Screen: ERROR [%s]", errorMsg.c_str());
}

// ---- showLowOil() -------------------------------------------
void DisplayManager::showLowOil(float remainingMl) {
    _mode        = DisplayMode::LOW_OIL;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "%c LOW OIL LEVEL!", (char)CC_WARN);
    _lcd.print(buf);
    _lcd.setCursor(0, 1);
    snprintf(buf, sizeof(buf), "Remain: %5.0f mL", remainingMl);
    _lcd.print(buf);
    beepError();
    LOGF("LCD", "Screen: LOW_OIL (%.0f mL)", remainingMl);
}

// ---- showOfflineQueued() ------------------------------------
void DisplayManager::showOfflineQueued(int queueSize) {
    _mode        = DisplayMode::OFFLINE;
    _modeEnterMs = millis();

    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print("No Network      ");
    _lcd.setCursor(0, 1);
    char buf[LCD_COLS + 1];
    snprintf(buf, sizeof(buf), "Queued: %d txns  ", queueSize);
    _lcd.print(buf);
    LOGF("LCD", "Screen: OFFLINE (queue=%d)", queueSize);
}

// ---- showNetworkStatus() ------------------------------------
void DisplayManager::showNetworkStatus(bool online, int signalQuality) {
    // Overlay network info on line 2 without clearing the screen
    _lcd.setCursor(0, 1);
    char buf[LCD_COLS + 1];
    if (online) {
        snprintf(buf, sizeof(buf), "%cGSM: SIG %d/31  ", (char)CC_SIGNAL, signalQuality);
    } else {
        snprintf(buf, sizeof(buf), "GSM: No network ");
    }
    _lcd.print(buf);
}

// ---- showMessage() ------------------------------------------
void DisplayManager::showMessage(const String& line1, const String& line2) {
    _lcd.clear();
    _lcd.setCursor(0, 0);
    _lcd.print(padLine(line1));
    if (line2.length() > 0) {
        _lcd.setCursor(0, 1);
        _lcd.print(padLine(line2));
    }
}

// ============================================================
// Buzzer Alerts
// ============================================================

// ---- beep() - Single tone for given duration ----------------
void DisplayManager::beep(int durationMs) {
    #if BUZZER_ENABLED
        digitalWrite(BUZZER_PIN, HIGH);
        delay(durationMs);
        digitalWrite(BUZZER_PIN, LOW);
    #endif
}

// ---- beepSuccess() - Rising double-beep ---------------------
void DisplayManager::beepSuccess() {
    #if BUZZER_ENABLED
        beep(BUZZ_SHORT_MS);
        delay(50);
        beep(BUZZ_SHORT_MS);
        delay(50);
        beep(BUZZ_SHORT_MS * 2);
    #endif
}

// ---- beepError() - Two long bursts --------------------------
void DisplayManager::beepError() {
    #if BUZZER_ENABLED
        beep(BUZZ_LONG_MS);
        delay(BUZZ_SHORT_MS);
        beep(BUZZ_LONG_MS);
    #endif
}

// ============================================================
// Private Helpers
// ============================================================

// ---- drawProgressBar() --------------------------------------
// Renders a 16-char progress bar using full-block custom chars
// and '-' for empty positions.
void DisplayManager::drawProgressBar(int row, float percent) {
    int filled = (int)(percent * LCD_COLS);
    filled = constrain(filled, 0, LCD_COLS);

    _lcd.setCursor(0, row);
    for (int i = 0; i < LCD_COLS; i++) {
        if (i < filled) {
            _lcd.write((uint8_t)CC_FULL);
        } else {
            _lcd.write('-');
        }
    }
}

// ---- padLine() ----------------------------------------------
// Pad or truncate a string to exactly LCD_COLS characters so
// that stale characters on the LCD are always overwritten.
String DisplayManager::padLine(const String& s) const {
    String result = s.substring(0, LCD_COLS);
    while ((int)result.length() < LCD_COLS) result += ' ';
    return result;
}
