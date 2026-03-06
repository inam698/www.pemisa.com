/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER — Main Firmware Integration Sketch       ║
 * ║                                                                      ║
 * ║  ESP32 Dev Module — Cooking Oil Vending Machine                     ║
 * ║  Scalable for 1000+ dispensers across multiple stations.            ║
 * ║                                                                      ║
 * ║  HARDWARE:                                                           ║
 * ║    • Flow sensor (AICHI OF05ZAT or YF-S201) on FLOW_SENSOR_PIN     ║
 * ║    • 12V oil pump relay on PUMP_RELAY_PIN                           ║
 * ║    • 4×4 keypad (matrix)                                            ║
 * ║    • 16×2 I2C LCD                                                   ║
 * ║    • WiFi connectivity to Pimisa cloud                              ║
 * ║                                                                      ║
 * ║  FEATURES:                                                           ║
 * ║    1. Voucher mode — cloud-verified voucher codes                   ║
 * ║    2. Cash mode    — operator enters amount paid                    ║
 * ║    3. OTA updates  — remote firmware deployment                     ║
 * ║    4. NVS storage  — offline queue survives power outage            ║
 * ║    5. Adaptive heartbeat — server-controlled interval               ║
 * ║    6. Telemetry    — RSSI, heap, uptime, pump cycles                ║
 * ║                                                                      ║
 * ║  Version: 2.1.0                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * LIBRARY DEPENDENCIES (install in Arduino IDE / PlatformIO):
 *   - ArduinoJson        (v7+)
 *   - LiquidCrystal_I2C  (for I2C LCD)
 *   - Keypad             (Mark Stanley, Alexander Brevig)
 *
 * WIRING:
 *   Flow Sensor  → GPIO 27 (interrupt-capable)
 *   Pump Relay   → GPIO 26
 *   LCD SDA      → GPIO 21 (default I2C)
 *   LCD SCL      → GPIO 22 (default I2C)
 *   Keypad rows  → GPIO 13, 12, 14, 25
 *   Keypad cols  → GPIO 33, 32, 18, 19
 */

// ═══════════════════════════════════════════════════════════════════════
//  INCLUDES
// ═══════════════════════════════════════════════════════════════════════

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

// Pimisa IoT modules
#include "config.h"
#include "wifi_manager.h"
#include "api_client.h"
#include "voucher_service.h"
#include "sales_reporting.h"
#include "heartbeat_service.h"
#include "ota_manager.h"
#include "nvs_storage.h"

// ═══════════════════════════════════════════════════════════════════════
//  HARDWARE SETUP
// ═══════════════════════════════════════════════════════════════════════

// ─── LCD ────────────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// ─── Keypad ─────────────────────────────────────────────────────────
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = KEYPAD_ROW_PINS;
byte colPins[COLS] = KEYPAD_COL_PINS;
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ─── Flow Sensor ────────────────────────────────────────────────────
volatile unsigned long pulseCount = 0;
float litresDispensed = 0.0f;
float targetLitres = 0.0f;

void IRAM_ATTR flowPulseISR() {
  pulseCount++;
}

// ─── Pump Relay ─────────────────────────────────────────────────────
bool pumpRunning = false;
unsigned long pumpStartTime = 0;

// ═══════════════════════════════════════════════════════════════════════
//  PIMISA IoT SERVICE OBJECTS
// ═══════════════════════════════════════════════════════════════════════

WifiManager wifiManager;
ApiClient apiClient;
VoucherService voucherService;
SalesReporting salesReporting;
HeartbeatService heartbeatService;
OtaManager otaManager;
NvsStorage nvsStorage;

// Adaptive timing (server-controlled)
unsigned long heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS;
unsigned long lastTelemetryMs = 0;
unsigned long lastNvsUploadMs = 0;
unsigned long lastSensorReadMs = 0;
float pricePerLitre = DEFAULT_PRICE_PER_LITRE;
int configVersion = 0;

// Sensor reading interval (read sensors every 5 seconds)
const unsigned long SENSOR_READ_INTERVAL_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════
//  STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════

enum DispenserState {
  STATE_IDLE,                // Waiting — show main menu
  STATE_SELECT_MODE,         // User choosing voucher, cash, or buy litres
  STATE_VOUCHER_PHONE,       // Entering phone number
  STATE_VOUCHER_CODE,        // Entering voucher code
  STATE_VOUCHER_VERIFYING,   // Waiting for server response
  STATE_CASH_AMOUNT,         // Entering cash amount (purchase by price)
  STATE_BUY_LITRES,          // Entering litres directly (purchase by volume)
  STATE_DISPENSING,          // Pump running, counting litres
  STATE_COMPLETE,            // Transaction finished
  STATE_ERROR,               // Error state with message
};

DispenserState currentState = STATE_IDLE;
DispenserState previousState = STATE_ERROR; // Force initial screen draw

// Input buffers
String inputBuffer = "";
String phoneNumber = "";
String voucherCode = "";
float transactionAmount = 0.0f;
float transactionLitres = 0.0f;
String transactionType = "";  // "cash" or "voucher"
String errorMessage = "";

// Timing
unsigned long stateEnteredMs = 0;
unsigned long lastLcdUpdateMs = 0;
const unsigned long LCD_UPDATE_INTERVAL = 250; // 4 FPS LCD refresh during dispensing
unsigned long lastFlowCheckMs = 0;

// ═══════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║  PIMISA IoT Oil Dispenser v" FIRMWARE_VERSION "        ║");
  Serial.println("╚══════════════════════════════════════════╝");

  // ── Initialize hardware ────────────────────────────────────────
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Pimisa Dispenser");
  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  // Pump relay (active LOW for most relay boards)
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, HIGH); // Pump OFF
  pumpRunning = false;

  // Flow sensor with interrupt
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulseISR, RISING);

  // Oil level and temperature sensor pins (analog)
  pinMode(OIL_LEVEL_PIN, INPUT);
  pinMode(TEMP_SENSOR_PIN, INPUT);

  // ── Initialize WiFi ────────────────────────────────────────────
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi.");

  wifiManager.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CONNECT_TIMEOUT_MS);

  if (wifiManager.isConnected()) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(wifiManager.getIPAddress());
    delay(1500);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed");
    lcd.setCursor(0, 1);
    lcd.print("Offline mode...");
    delay(2000);
  }

  // ── Initialize IoT services ────────────────────────────────────
  apiClient.begin(SERVER_BASE_URL, DEVICE_ID, API_KEY);
  apiClient.setTimeout(API_TIMEOUT_MS);
  apiClient.setRetry(API_MAX_RETRIES, API_RETRY_DELAY_MS);

  // ── Initialize NVS persistent storage ──────────────────────────
  #if NVS_ENABLED
  nvsStorage.begin();
  // Restore server-pushed config from NVS
  pricePerLitre = nvsStorage.getPricePerLitre(DEFAULT_PRICE_PER_LITRE);
  heartbeatIntervalMs = (unsigned long)nvsStorage.getHeartbeatInterval(HEARTBEAT_INTERVAL_MS / 1000) * 1000UL;
  configVersion = nvsStorage.getConfigVersion(0);
  Serial.printf("[Setup] Restored config: price=%.1f, hb=%lums, ver=%d\n",
                pricePerLitre, heartbeatIntervalMs, configVersion);
  #endif

  voucherService.begin(&apiClient, DEVICE_ID);
  salesReporting.begin(&apiClient, DEVICE_ID, pricePerLitre);
  heartbeatService.begin(&apiClient, DEVICE_ID, heartbeatIntervalMs);

  // Send initial heartbeat
  if (wifiManager.isConnected()) {
    heartbeatService.sendNow();
  }

  Serial.println("[Setup] Initialization complete");
  currentState = STATE_IDLE;
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════

void loop() {
  // ── Maintain WiFi connection ───────────────────────────────────
  wifiManager.loop();

  // ── Read sensors and update heartbeat data ──────────────────────
  if (millis() - lastSensorReadMs >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadMs = millis();
    heartbeatService.setOilLevel(readOilLevel());
    heartbeatService.setTemperature(readTemperature());
  }

  // ── Send heartbeats & process offline queues ───────────────────
  if (wifiManager.isConnected()) {
    heartbeatService.loop();
    salesReporting.processOfflineQueue();

    // Upload NVS-persisted offline sales (survived power outage)
    #if NVS_ENABLED
    if (millis() - lastNvsUploadMs > NVS_OFFLINE_RETRY_MS) {
      lastNvsUploadMs = millis();
      uploadNvsSales();
    }
    #endif
  }

  // ── Read keypad ────────────────────────────────────────────────
  char key = keypad.getKey();

  // ── State machine ─────────────────────────────────────────────
  switch (currentState) {
    case STATE_IDLE:
      handleIdleState(key);
      break;
    case STATE_SELECT_MODE:
      handleSelectModeState(key);
      break;
    case STATE_VOUCHER_PHONE:
      handleVoucherPhoneState(key);
      break;
    case STATE_VOUCHER_CODE:
      handleVoucherCodeState(key);
      break;
    case STATE_VOUCHER_VERIFYING:
      // This is handled synchronously in the transition
      break;
    case STATE_CASH_AMOUNT:
      handleCashAmountState(key);
      break;
    case STATE_BUY_LITRES:
      handleBuyLitresState(key);
      break;
    case STATE_DISPENSING:
      handleDispensingState(key);
      break;
    case STATE_COMPLETE:
      handleCompleteState(key);
      break;
    case STATE_ERROR:
      handleErrorState(key);
      break;
  }

  // ── Safety: watchdog for pump ──────────────────────────────────
  if (pumpRunning) {
    // Emergency stop if pump runs too long
    if (millis() - pumpStartTime > MAX_DISPENSE_TIME_MS) {
      stopPump();
      errorMessage = "Timeout! Pump off";
      changeState(STATE_ERROR);
    }

    // Emergency stop if no flow detected
    if (millis() - lastFlowCheckMs > FLOW_TIMEOUT_MS && litresDispensed < 0.01f) {
      stopPump();
      errorMessage = "No flow detected";
      changeState(STATE_ERROR);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  STATE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

void changeState(DispenserState newState) {
  previousState = currentState;
  currentState = newState;
  stateEnteredMs = millis();
}

// ─── IDLE STATE ─────────────────────────────────────────────────────

void handleIdleState(char key) {
  // Draw screen once on entry
  if (previousState != STATE_IDLE) {
    previousState = STATE_IDLE;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("PIMISA DISPENSER");
    lcd.setCursor(0, 1);

    // Show connection status
    if (wifiManager.isConnected()) {
      uint8_t queued = salesReporting.getQueuedCount();
      if (queued > 0) {
        lcd.printf("Online Q:%d  #=Go", queued);
      } else {
        lcd.print("Online     #=Go");
      }
    } else {
      lcd.print("Offline    #=Go");
    }
  }

  if (key == '#') {
    changeState(STATE_SELECT_MODE);
  }
}

// ─── SELECT MODE STATE ──────────────────────────────────────────────

void handleSelectModeState(char key) {
  if (previousState != STATE_SELECT_MODE) {
    previousState = STATE_SELECT_MODE;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("A=Voucher B=Cash");
    lcd.setCursor(0, 1);
    lcd.print("C=Buy Litres *=X");
  }

  if (key == 'A') {
    // Voucher mode requires WiFi
    if (!wifiManager.isConnected()) {
      errorMessage = "No WiFi for vou-";
      changeState(STATE_ERROR);
      return;
    }
    inputBuffer = "";
    phoneNumber = "";
    changeState(STATE_VOUCHER_PHONE);
  } else if (key == 'B') {
    inputBuffer = "";
    changeState(STATE_CASH_AMOUNT);
  } else if (key == 'C') {
    inputBuffer = "";
    changeState(STATE_BUY_LITRES);
  } else if (key == '*') {
    changeState(STATE_IDLE);
  }
}

// ─── VOUCHER: PHONE ENTRY ───────────────────────────────────────────

void handleVoucherPhoneState(char key) {
  if (previousState != STATE_VOUCHER_PHONE) {
    previousState = STATE_VOUCHER_PHONE;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Phone Number:");
    lcd.setCursor(0, 1);
    lcd.print("_");
  }

  if (key >= '0' && key <= '9') {
    if (inputBuffer.length() < 15) {
      inputBuffer += key;
      lcd.setCursor(0, 1);
      lcd.print(inputBuffer + "_       ");
    }
  } else if (key == '*') {
    // Backspace
    if (inputBuffer.length() > 0) {
      inputBuffer.remove(inputBuffer.length() - 1);
      lcd.setCursor(0, 1);
      lcd.print(inputBuffer + "_       ");
    } else {
      changeState(STATE_SELECT_MODE);
    }
  } else if (key == '#') {
    // Confirm phone number
    if (inputBuffer.length() >= 9) {
      phoneNumber = inputBuffer;
      inputBuffer = "";
      changeState(STATE_VOUCHER_CODE);
    } else {
      lcd.setCursor(0, 0);
      lcd.print("Min 9 digits!   ");
      delay(1000);
      previousState = STATE_ERROR; // Force redraw
    }
  }
}

// ─── VOUCHER: CODE ENTRY ────────────────────────────────────────────

void handleVoucherCodeState(char key) {
  if (previousState != STATE_VOUCHER_CODE) {
    previousState = STATE_VOUCHER_CODE;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Voucher Code:");
    lcd.setCursor(0, 1);
    lcd.print("_");
  }

  if (key >= '0' && key <= '9') {
    if (inputBuffer.length() < 8) {
      inputBuffer += key;
      lcd.setCursor(0, 1);
      lcd.print(inputBuffer + "_       ");
    }
  } else if (key == '*') {
    if (inputBuffer.length() > 0) {
      inputBuffer.remove(inputBuffer.length() - 1);
      lcd.setCursor(0, 1);
      lcd.print(inputBuffer + "_       ");
    } else {
      inputBuffer = phoneNumber; // Go back to phone
      changeState(STATE_VOUCHER_PHONE);
    }
  } else if (key == '#') {
    if (inputBuffer.length() >= 4) {
      voucherCode = inputBuffer;
      inputBuffer = "";

      // ── Verify voucher with cloud server ─────────────────
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Verifying...");
      lcd.setCursor(0, 1);
      lcd.print("Please wait");

      VoucherResult result = voucherService.verify(
          phoneNumber.c_str(), voucherCode.c_str());

      if (result.approved) {
        transactionType = "voucher";
        transactionLitres = result.litres;
        transactionAmount = result.amount;
        targetLitres = result.litres;

        // Show beneficiary name + litres on LCD
        lcd.clear();
        lcd.setCursor(0, 0);
        String ownerLine = result.beneficiaryName;
        if (ownerLine.length() > 16) ownerLine = ownerLine.substring(0, 16);
        if (ownerLine.length() > 0) {
          lcd.print(ownerLine);
        } else {
          lcd.print("Voucher Approved");
        }
        lcd.setCursor(0, 1);
        lcd.printf("%.2fL K%.0f #=Go", result.litres, result.amount);

        // Wait for confirmation
        while (true) {
          char confirmKey = keypad.getKey();
          if (confirmKey == '#') {
            startDispensing();
            break;
          } else if (confirmKey == '*') {
            changeState(STATE_IDLE);
            return;
          }
          delay(50);
        }
      } else {
        errorMessage = result.message;
        if (errorMessage.length() > 16) {
          errorMessage = errorMessage.substring(0, 16);
        }
        changeState(STATE_ERROR);
      }
    } else {
      lcd.setCursor(0, 0);
      lcd.print("Min 4 digits!   ");
      delay(1000);
      previousState = STATE_ERROR; // Force redraw
    }
  }
}

// ─── CASH: AMOUNT ENTRY ─────────────────────────────────────────────

void handleCashAmountState(char key) {
  if (previousState != STATE_CASH_AMOUNT) {
    previousState = STATE_CASH_AMOUNT;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.printf("Price:K%.0f/L", salesReporting.getPricePerLitre());
    lcd.setCursor(0, 1);
    lcd.print("Amt:K_");
  }

  if (key >= '0' && key <= '9') {
    if (inputBuffer.length() < 6) {
      inputBuffer += key;
      lcd.setCursor(0, 1);
      lcd.print("Amt:K" + inputBuffer + "_     ");
    }
  } else if (key == '*') {
    if (inputBuffer.length() > 0) {
      inputBuffer.remove(inputBuffer.length() - 1);
      lcd.setCursor(0, 1);
      lcd.print("Amt:K" + inputBuffer + "_     ");
    } else {
      changeState(STATE_SELECT_MODE);
    }
  } else if (key == '#') {
    if (inputBuffer.length() > 0) {
      float amount = inputBuffer.toFloat();
      if (amount <= 0) {
        lcd.setCursor(0, 0);
        lcd.print("Invalid amount! ");
        delay(1000);
        inputBuffer = "";
        previousState = STATE_ERROR; // Force redraw
        return;
      }

      float litres = salesReporting.amountToLitres(amount);

      if (litres > MAX_DISPENSE_LITRES) {
        lcd.setCursor(0, 0);
        lcd.printf("Max %.0fL!      ", MAX_DISPENSE_LITRES);
        delay(1500);
        inputBuffer = "";
        previousState = STATE_ERROR; // Force redraw
        return;
      }

      transactionType = "cash";
      transactionAmount = amount;
      transactionLitres = litres;
      targetLitres = litres;

      // Confirm with operator
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.printf("K%.0f = %.2fL", amount, litres);
      lcd.setCursor(0, 1);
      lcd.print("#=Dispense *=No");

      // Wait for confirmation
      while (true) {
        char confirmKey = keypad.getKey();
        if (confirmKey == '#') {
          startDispensing();
          break;
        } else if (confirmKey == '*') {
          inputBuffer = "";
          changeState(STATE_IDLE);
          return;
        }
        delay(50);
      }
    }
  }
}

// ─── BUY LITRES: DIRECT PURCHASE BY VOLUME ──────────────────────────

void handleBuyLitresState(char key) {
  if (previousState != STATE_BUY_LITRES) {
    previousState = STATE_BUY_LITRES;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.printf("Price:K%.0f/L", salesReporting.getPricePerLitre());
    lcd.setCursor(0, 1);
    lcd.print("Litres:_");
  }

  if (key >= '0' && key <= '9') {
    if (inputBuffer.length() < 4) {
      inputBuffer += key;
      lcd.setCursor(0, 1);
      lcd.print("Litres:" + inputBuffer + "_    ");
    }
  } else if (key == '*') {
    if (inputBuffer.length() > 0) {
      inputBuffer.remove(inputBuffer.length() - 1);
      lcd.setCursor(0, 1);
      lcd.print("Litres:" + inputBuffer + "_    ");
    } else {
      changeState(STATE_SELECT_MODE);
    }
  } else if (key == '#') {
    if (inputBuffer.length() > 0) {
      float litres = inputBuffer.toFloat();
      if (litres <= 0) {
        lcd.setCursor(0, 0);
        lcd.print("Invalid amount! ");
        delay(1000);
        inputBuffer = "";
        previousState = STATE_ERROR;
        return;
      }
      if (litres > MAX_DISPENSE_LITRES) {
        lcd.setCursor(0, 0);
        lcd.printf("Max %.0fL!      ", MAX_DISPENSE_LITRES);
        delay(1500);
        inputBuffer = "";
        previousState = STATE_ERROR;
        return;
      }

      float amount = salesReporting.litresToAmount(litres);
      transactionType = "cash";
      transactionAmount = amount;
      transactionLitres = litres;
      targetLitres = litres;

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.printf("%.1fL = K%.0f", litres, amount);
      lcd.setCursor(0, 1);
      lcd.print("#=Dispense *=No");

      while (true) {
        char confirmKey = keypad.getKey();
        if (confirmKey == '#') {
          startDispensing();
          break;
        } else if (confirmKey == '*') {
          inputBuffer = "";
          changeState(STATE_IDLE);
          return;
        }
        delay(50);
      }
    }
  }
}

// ─── DISPENSING STATE ───────────────────────────────────────────────

void handleDispensingState(char key) {
  // Emergency stop on any key press during dispensing
  if (key == '*' || key == 'D') {
    stopPump();
    finishTransaction();
    return;
  }

  // Calculate litres from pulses
  noInterrupts();
  unsigned long currentPulses = pulseCount;
  interrupts();

  litresDispensed = (float)currentPulses / PULSES_PER_LITRE;

  // Update LCD periodically
  unsigned long now = millis();
  if (now - lastLcdUpdateMs >= LCD_UPDATE_INTERVAL) {
    lastLcdUpdateMs = now;

    lcd.setCursor(0, 0);
    lcd.printf("Dispensing...   ");
    lcd.setCursor(0, 1);
    lcd.printf("%.2fL / %.2fL  ", litresDispensed, targetLitres);
  }

  // Check if target reached
  if (litresDispensed >= (targetLitres - FLOW_TOLERANCE)) {
    stopPump();
    finishTransaction();
  }
}

// ─── COMPLETE STATE ─────────────────────────────────────────────────

void handleCompleteState(char key) {
  if (previousState != STATE_COMPLETE) {
    previousState = STATE_COMPLETE;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.printf("Done! %.2fL", litresDispensed);
    lcd.setCursor(0, 1);
    lcd.print("K" + String(transactionAmount, 0) + " #=Menu");
  }

  // Return to idle after 10 seconds or on key press
  if (key == '#' || key == '*' || (millis() - stateEnteredMs > 10000)) {
    changeState(STATE_IDLE);
  }
}

// ─── ERROR STATE ────────────────────────────────────────────────────

void handleErrorState(char key) {
  if (previousState != STATE_ERROR) {
    previousState = STATE_ERROR;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(errorMessage);
    lcd.setCursor(0, 1);
    lcd.print("*=Back");
  }

  if (key == '*' || key == '#' || (millis() - stateEnteredMs > 8000)) {
    errorMessage = "";
    changeState(STATE_IDLE);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PUMP CONTROL & TRANSACTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

void startDispensing() {
  Serial.printf("[Dispense] Starting — target: %.3fL type: %s\n",
                targetLitres, transactionType.c_str());

  // Reset flow counter
  noInterrupts();
  pulseCount = 0;
  interrupts();
  litresDispensed = 0.0f;
  lastFlowCheckMs = millis();

  startPump();
  changeState(STATE_DISPENSING);
}

void startPump() {
  digitalWrite(PUMP_RELAY_PIN, LOW); // Active LOW relay
  pumpRunning = true;
  pumpStartTime = millis();
  Serial.println("[Pump] ON");
}

void stopPump() {
  digitalWrite(PUMP_RELAY_PIN, HIGH); // Pump OFF
  pumpRunning = false;
  Serial.printf("[Pump] OFF — dispensed %.3fL in %lums\n",
                litresDispensed, millis() - pumpStartTime);
}

void finishTransaction() {
  Serial.printf("[Transaction] Complete — type: %s  litres: %.3f  amount: K%.2f\n",
                transactionType.c_str(), litresDispensed, transactionAmount);

  // Track pump cycle and last voucher for heartbeat telemetry
  heartbeatService.incrementPumpCycles();
  if (transactionType == "voucher" && voucherCode.length() > 0) {
    heartbeatService.setLastVoucher(voucherCode);
  }

  // ── Log unified transaction (updates inventory on server) ───────
  float oilMl = litresDispensed * 1000.0f;
  if (transactionType == "voucher") {
    salesReporting.logTransaction("voucher", oilMl,
                                  transactionAmount, voucherCode.c_str());
  } else {
    salesReporting.logTransaction("purchase", oilMl,
                                  transactionAmount, "");
  }

  // ── Report to cloud server (legacy sale endpoint) ───────────────
  if (transactionType == "voucher") {
    // Confirm voucher redemption
    bool redeemed = voucherService.redeem(voucherCode.c_str(), litresDispensed);
    if (!redeemed) {
      Serial.println("[Transaction] WARNING: Voucher redemption report failed (queued)");
    }
    // Also report as a sale
    salesReporting.reportVoucherSale(
        litresDispensed, transactionAmount,
        voucherCode.c_str(), phoneNumber.c_str());
  } else if (transactionType == "cash") {
    // Report cash sale
    salesReporting.reportCashSale(litresDispensed, transactionAmount);
  }

  // ── Reset transaction state ─────────────────────────────────────
  changeState(STATE_COMPLETE);
}

// ═══════════════════════════════════════════════════════════════════════
//  SENSOR READING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Read oil tank level from analog sensor.
 * Returns percentage (0-100%) based on ADC reading.
 * Calibration: 0V = empty (0%), 3.3V = full (100%).
 * Uses averaging to reduce noise.
 */
float readOilLevel() {
  long sum = 0;
  const int samples = 10;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(OIL_LEVEL_PIN);
    delayMicroseconds(100);
  }
  float avg = (float)sum / samples;
  // ESP32 ADC: 12-bit (0-4095), 0-3.3V
  float percentage = (avg / 4095.0f) * 100.0f;
  return constrain(percentage, 0.0f, 100.0f);
}

/**
 * Read temperature from analog NTC thermistor or DS18B20.
 * Returns temperature in °C.
 * For NTC: uses Steinhart-Hart approximation.
 * Adjust R_FIXED and BETA for your thermistor.
 */
float readTemperature() {
  long sum = 0;
  const int samples = 10;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(TEMP_SENSOR_PIN);
    delayMicroseconds(100);
  }
  float avg = (float)sum / samples;

  // NTC thermistor calculation (voltage divider with 10kΩ fixed resistor)
  const float R_FIXED = 10000.0f;  // Fixed resistor value
  const float BETA = 3950.0f;      // NTC beta coefficient
  const float T0 = 298.15f;        // 25°C in Kelvin
  const float R0 = 10000.0f;       // NTC resistance at 25°C

  if (avg <= 0 || avg >= 4095) return -999.0f; // Sensor error

  float resistance = R_FIXED * (4095.0f / avg - 1.0f);
  float tempK = 1.0f / (1.0f / T0 + (1.0f / BETA) * log(resistance / R0));
  float tempC = tempK - 273.15f;

  return tempC;
}

// ═══════════════════════════════════════════════════════════════════════
//  INTEGRATION NOTES
// ═══════════════════════════════════════════════════════════════════════
//
//  If you already have an existing dispenser sketch:
//
//  1. Copy these IoT modules into your project:
//       config.h, wifi_manager.h/.cpp, api_client.h/.cpp,
//       voucher_service.h/.cpp, sales_reporting.h/.cpp,
//       heartbeat_service.h/.cpp
//
//  2. Add these global objects in your existing sketch:
//       WifiManager wifiManager;
//       ApiClient apiClient;
//       VoucherService voucherService;
//       SalesReporting salesReporting;
//       HeartbeatService heartbeatService;
//
//  3. In your setup(), add after hardware init:
//       wifiManager.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CONNECT_TIMEOUT_MS);
//       apiClient.begin(SERVER_BASE_URL, DEVICE_ID, API_KEY);
//       voucherService.begin(&apiClient, DEVICE_ID);
//       salesReporting.begin(&apiClient, DEVICE_ID, DEFAULT_PRICE_PER_LITRE);
//       heartbeatService.begin(&apiClient, DEVICE_ID, HEARTBEAT_INTERVAL_MS);
//
//  4. In your loop(), add:
//       wifiManager.loop();
//       if (wifiManager.isConnected()) {
//         heartbeatService.loop();
//         salesReporting.processOfflineQueue();
//       }
//
//  5. When a voucher transaction starts:
//       VoucherResult result = voucherService.verify(phone, code);
//       if (result.approved) {
//         // Dispense result.litres
//         // After dispensing:
//         voucherService.redeem(code, actualLitresDispensed);
//       }
//
//  6. When a cash transaction completes:
//       salesReporting.reportCashSale(litresDispensed, amountPaid);
//
//  7. For amount-to-litres conversion:
//       float litres = salesReporting.amountToLitres(amountZMW);
//
//  8. OTA updates are handled automatically:
//       Heartbeat response includes ota_update when admin pushes new firmware.
//       Call handleOtaFromHeartbeat() after processing heartbeat response.
//
//  9. NVS persistence:
//       Offline sales survive power outages via nvsStorage.
//       Call nvsStorage.addDispensedLitres() after each transaction.
//
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  NVS OFFLINE SALE UPLOAD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Uploads offline sales persisted in NVS flash back to the server.
 * Called periodically when WiFi is available.
 */
void uploadNvsSales() {
  #if NVS_ENABLED
  int pending = nvsStorage.getOfflineSaleCount();
  if (pending == 0) return;

  Serial.printf("[NVS] Uploading %d persisted offline sales...\n", pending);

  int uploaded = 0;
  OfflineSale sale;

  while (nvsStorage.peekOfflineSale(sale)) {
    bool success;
    if (strcmp(sale.paymentType, "voucher") == 0) {
      success = salesReporting.reportVoucherSale(
          sale.litres, sale.amount, sale.voucherCode, sale.phone);
    } else {
      success = salesReporting.reportCashSale(sale.litres, sale.amount);
    }

    if (success) {
      nvsStorage.popOfflineSale();
      uploaded++;
    } else {
      break; // Server unreachable — try again next cycle
    }
  }

  if (uploaded > 0) {
    Serial.printf("[NVS] Uploaded %d offline sales\n", uploaded);
  }
  #endif
}

// ═══════════════════════════════════════════════════════════════════════
//  OTA UPDATE HANDLER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Process OTA update info received from heartbeat response.
 * Called with parsed JSON from server heartbeat.
 *
 * @param otaVersion   target firmware version string
 * @param otaUrl       URL to download .bin file
 */
void handleOtaUpdate(const String& otaVersion, const String& otaUrl) {
  if (otaVersion.length() == 0 || otaUrl.length() == 0) return;

  // Don't update if already on this version
  if (otaVersion == FIRMWARE_VERSION) {
    Serial.printf("[OTA] Already on version %s\n", FIRMWARE_VERSION);
    return;
  }

  // Don't attempt OTA during a transaction
  if (currentState == STATE_DISPENSING || currentState == STATE_VOUCHER_VERIFYING) {
    Serial.println("[OTA] Update deferred — transaction in progress");
    return;
  }

  Serial.printf("[OTA] Server requests update to %s\n", otaVersion.c_str());

  // Show user notification on LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Updating FW...");
  lcd.setCursor(0, 1);
  lcd.print(otaVersion);

  // Attempt the update (device reboots on success)
  bool success = otaManager.performUpdate(otaUrl, otaVersion);

  if (!success) {
    Serial.printf("[OTA] Update failed: %s\n", otaManager.getLastError().c_str());

    #if NVS_ENABLED
    int retries = nvsStorage.getOtaRetryCount() + 1;
    nvsStorage.setOtaRetryCount(retries);
    if (retries >= OTA_MAX_RETRIES) {
      Serial.println("[OTA] Max retries reached — skipping this version");
      nvsStorage.setOtaRetryCount(0);
    }
    #endif

    // Restore LCD to normal
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Update failed");
    lcd.setCursor(0, 1);
    lcd.print("Resuming...");
    delay(2000);
  }
}

/**
 * Save NVS-persistent offline sale on dispensing complete.
 * Called when the network is down and the in-memory queue might be lost.
 */
void saveToNvs(float litres, float amount, const char* paymentType,
               const char* voucherCode, const char* phone) {
  #if NVS_ENABLED
  OfflineSale sale;
  sale.litres = litres;
  sale.amount = amount;
  strncpy(sale.paymentType, paymentType, sizeof(sale.paymentType) - 1);
  sale.paymentType[sizeof(sale.paymentType) - 1] = '\0';
  strncpy(sale.voucherCode, voucherCode ? voucherCode : "", sizeof(sale.voucherCode) - 1);
  sale.voucherCode[sizeof(sale.voucherCode) - 1] = '\0';
  strncpy(sale.phone, phone ? phone : "", sizeof(sale.phone) - 1);
  sale.phone[sizeof(sale.phone) - 1] = '\0';
  sale.timestamp = millis() / 1000;

  nvsStorage.pushOfflineSale(sale);
  nvsStorage.addDispensedLitres(litres);
  nvsStorage.incrementPumpCycles();
  #endif
}
