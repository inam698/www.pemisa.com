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
 * ║    • WiFi + GSM/GPRS dual connectivity with auto-failover          ║
 * ║    • SIM800L module for GSM/GPRS backup                           ║
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
 *   Keypad rows  → GPIO 27, 14, 15, 13
 *   Keypad cols  → GPIO 33, 32, 18, 19
 */

// ═══════════════════════════════════════════════════════════════════════
//  INCLUDES
// ═══════════════════════════════════════════════════════════════════════

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>

// Pimisa IoT modules
#include "config.h"
#include "wifi_manager.h"
#include "gsm_manager.h"
#include "connectivity_manager.h"
#include "api_client.h"
#include "voucher_service.h"
#include "sales_reporting.h"
#include "heartbeat_service.h"
#include "ota_manager.h"
#include "nvs_storage.h"
#include "keypad_input.h"

#include <nvs_flash.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ═══════════════════════════════════════════════════════════════════════
//  HARDWARE SETUP
// ═══════════════════════════════════════════════════════════════════════

// ─── LCD ────────────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// ─── Keypad ─────────────────────────────────────────────────────────
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '4', '7', '*'},
  {'2', '5', '8', '0'},
  {'3', '6', '9', '#'},
  {'A', 'B', 'C', 'D'}
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

ConnectivityManager connManager;
ApiClient apiClient;
VoucherService voucherService;
SalesReporting salesReporting;
HeartbeatService heartbeatService;
OtaManager otaManager;
NvsStorage nvsStorage;
KeypadInput keypadInput;

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
  // ── Settings / WiFi Setup ──────────────────────────────
  STATE_SETTINGS,            // Settings menu: A=WiFi B=Pref C=Info
  STATE_WIFI_SCAN,           // Scanning for WiFi networks
  STATE_WIFI_SELECT,         // Scrolling through found networks
  STATE_WIFI_SSID_ENTRY,     // Manual SSID entry (multi-tap)
  STATE_WIFI_PASSWORD,       // Password entry (multi-tap)
  STATE_WIFI_CONNECTING,     // Attempting WiFi connection
  STATE_CONN_PREFERENCE,     // Choose WiFi-first or GSM-first
  STATE_CONN_INFO,           // Show connection info
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

// WiFi scan results (for STATE_WIFI_SELECT)
#define MAX_WIFI_SCAN_RESULTS 10
String wifiScanSSIDs[MAX_WIFI_SCAN_RESULTS];
int    wifiScanRSSI[MAX_WIFI_SCAN_RESULTS];
int    wifiScanCount = 0;
int    wifiSelectIndex = 0;
String wifiSelectedSSID = "";

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

  // Keypad: set debounce to suppress ghost/phantom key presses
  keypad.setDebounceTime(150);   // 150ms debounce (aggressive — GPIO 12 & DAC pins are noisy)
  keypad.setHoldTime(800);       // 800ms hold threshold

  // Enable internal pull-ups on BOTH row and column pins to prevent floating/ghost presses
  // GPIO 12 (row) is a bootstrap pin with internal pull-down — needs explicit pull-up
  // GPIO 25, 26 (cols) are DAC pins with leakage — need pull-ups too
  for (int i = 0; i < ROWS; i++) {
    pinMode(rowPins[i], INPUT_PULLUP);
  }
  for (int i = 0; i < COLS; i++) {
    pinMode(colPins[i], INPUT_PULLUP);
  }

  // ── Initialize hardware watchdog timer ─────────────────────────
  // Resets ESP32 if loop() hangs for WDT_TIMEOUT_SECONDS.
  // ESP32 Arduino Core v3.x (ESP-IDF 5.x) pre-initializes TWDT with
  // different API — use version guard for compatibility.
  #if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  const esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  esp_task_wdt_reconfigure(&wdt_config);
  esp_task_wdt_add(NULL);
  #else
  esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
  esp_task_wdt_add(NULL);
  #endif
  Serial.printf("[Setup] Watchdog timer enabled: %ds timeout\n", WDT_TIMEOUT_SECONDS);

  // ── Initialize NVS (erase if corrupted, then open) ─────────────
  #if NVS_ENABLED
  {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      Serial.println("[NVS] Partition full/corrupted — erasing...");
      nvs_flash_erase();
      nvs_flash_init();
    }
  }
  nvsStorage.begin();
  #endif

  // ── Initialize dual connectivity (WiFi + GSM) ────────────────
  lcd.setCursor(0, 1);
  lcd.print("Connecting...   ");

  connManager.begin(&nvsStorage);

  if (connManager.isConnected()) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.printf("%s Connected!", connManager.getTransportName().c_str());
    lcd.setCursor(0, 1);
    lcd.printf("Signal: %ddBm", connManager.getRSSI());
    delay(1500);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("No Connection");
    lcd.setCursor(0, 1);
    lcd.print("Offline mode...");
    delay(2000);
  }

  // ── Initialize IoT services ────────────────────────────────────
  apiClient.begin(SERVER_BASE_URL, DEVICE_ID, API_KEY, &connManager);
  apiClient.setTimeout(API_TIMEOUT_MS);
  apiClient.setRetry(API_MAX_RETRIES, API_RETRY_DELAY_MS);

  // ── Restore server-pushed config from NVS ─────────────────────
  #if NVS_ENABLED
  pricePerLitre = nvsStorage.getPricePerLitre(DEFAULT_PRICE_PER_LITRE);
  heartbeatIntervalMs = (unsigned long)nvsStorage.getHeartbeatInterval(HEARTBEAT_INTERVAL_MS / 1000) * 1000UL;
  configVersion = nvsStorage.getConfigVersion(0);
  Serial.printf("[Setup] Restored config: price=%.1f, hb=%lums, ver=%d\n",
                pricePerLitre, heartbeatIntervalMs, configVersion);
  #endif

  voucherService.begin(&apiClient, DEVICE_ID, &nvsStorage);
  salesReporting.begin(&apiClient, DEVICE_ID, pricePerLitre, &nvsStorage);
  heartbeatService.begin(&apiClient, DEVICE_ID, heartbeatIntervalMs);

  // Send initial heartbeat
  if (connManager.isConnected()) {
    heartbeatService.sendNow();
  }

  Serial.println("[Setup] Initialization complete");
  currentState = STATE_IDLE;
}

// ═══════════════════════════════════════════════════════════════════════
//  FORWARD DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════
void changeState(DispenserState newState);
void handleSettingsState(char key);
void handleWifiScanState(char key);
void handleWifiSelectState(char key);
void handleWifiSsidEntryState(char key);
void handleWifiPasswordState(char key);
void handleWifiConnectingState(char key);
void handleConnPreferenceState(char key);
void handleConnInfoState(char key);

// ═══════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════

void loop() {
  // ── Feed watchdog to prevent reset ─────────────────────────────
  esp_task_wdt_reset();

  // ── Maintain dual connectivity (WiFi + GSM) ───────────────────
  connManager.loop();

  // ── Read sensors and update heartbeat data ──────────────────────
  if (millis() - lastSensorReadMs >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadMs = millis();
    heartbeatService.setOilLevel(readOilLevel());
    heartbeatService.setTemperature(readTemperature());
  }

  // ── Send heartbeats & process offline queues ───────────────────
  // Skip all HTTP operations while pump is running — blocking network
  // calls (up to API_TIMEOUT_MS) would prevent the keypad from being
  // read and make the * emergency-stop key unresponsive.
  if (connManager.isConnected() && !pumpRunning) {
    heartbeatService.loop();
    salesReporting.processOfflineQueue();
    voucherService.processOfflineRedemptions();

    // Upload NVS-persisted offline sales (survived power outage)
    #if NVS_ENABLED
    if (millis() - lastNvsUploadMs > NVS_OFFLINE_RETRY_MS) {
      lastNvsUploadMs = millis();
      uploadNvsSales();
    }
    #endif
  }

  // ── Read keypad (with debounce) ──────────────────────────────
  static unsigned long lastKeyMs = 0;
  char key = 0;
  char rawKey = keypad.getKey();

  if (rawKey) {
    unsigned long now = millis();
    if (now - lastKeyMs >= 150) {  // 150ms debounce
      key = rawKey;
      lastKeyMs = now;
    }
  }

  // ── Tick multi-tap input timer ────────────────────────────────
  keypadInput.tick();

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
    // ── Settings / WiFi Setup states ────────────────────────
    case STATE_SETTINGS:
      handleSettingsState(key);
      break;
    case STATE_WIFI_SCAN:
      handleWifiScanState(key);
      break;
    case STATE_WIFI_SELECT:
      handleWifiSelectState(key);
      break;
    case STATE_WIFI_SSID_ENTRY:
      handleWifiSsidEntryState(key);
      break;
    case STATE_WIFI_PASSWORD:
      handleWifiPasswordState(key);
      break;
    case STATE_WIFI_CONNECTING:
      handleWifiConnectingState(key);
      break;
    case STATE_CONN_PREFERENCE:
      handleConnPreferenceState(key);
      break;
    case STATE_CONN_INFO:
      handleConnInfoState(key);
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

    // Show connection status with active transport
    if (connManager.isConnected()) {
      uint8_t queued = salesReporting.getQueuedCount();
      int pendingRedeem = voucherService.getPendingRedemptionCount();
      String transport = connManager.getTransportName();
      if (queued > 0 || pendingRedeem > 0) {
        lcd.printf("%s Q:%d #=Go", transport.c_str(), queued + pendingRedeem);
      } else {
        lcd.printf("%s      #=Go", transport.c_str());
      }
    } else {
      int cached = voucherService.getCachedVoucherCount();
      if (cached > 0) {
        lcd.printf("Offline C:%d#=Go", cached);
      } else {
        lcd.print("Offline    #=Go");
      }
    }
  }

  if (key == '#') {
    changeState(STATE_SELECT_MODE);
  } else if (key == 'D') {
    changeState(STATE_SETTINGS);
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
    // Voucher mode — works online AND offline (with cached vouchers)
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
        if (result.offlineVerified) {
          // Indicate offline verification to operator
          String offlineLine = "[OFF] ";
          offlineLine += String(result.litres, 1) + "L";
          lcd.print(offlineLine);
        } else {
          String ownerLine = result.beneficiaryName;
          if (ownerLine.length() > 16) ownerLine = ownerLine.substring(0, 16);
          if (ownerLine.length() > 0) {
            lcd.print(ownerLine);
          } else {
            lcd.print("Voucher Approved");
          }
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

  // ── Persist to NVS (survives power outage) ──────────────────────
  #if NVS_ENABLED
  nvsStorage.addDispensedLitres(litresDispensed);
  nvsStorage.incrementPumpCycles();
  #endif

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
//       connManager.begin(&nvsStorage);
//       apiClient.begin(SERVER_BASE_URL, DEVICE_ID, API_KEY, &connManager);
//       voucherService.begin(&apiClient, DEVICE_ID);
//       salesReporting.begin(&apiClient, DEVICE_ID, DEFAULT_PRICE_PER_LITRE);
//       heartbeatService.begin(&apiClient, DEVICE_ID, HEARTBEAT_INTERVAL_MS);
//
//  4. In your loop(), add:
//       connManager.loop();
//       if (connManager.isConnected()) {
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
//  SETTINGS / WIFI SETUP STATE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

// ─── SETTINGS MENU ────────────────────────────────────────────────────

void handleSettingsState(char key) {
  if (previousState != STATE_SETTINGS) {
    previousState = STATE_SETTINGS;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("A=WiFi  B=Pref");
    lcd.setCursor(0, 1);
    lcd.print("C=Info  *=Back");
  }

  if (key == 'A') {
    changeState(STATE_WIFI_SCAN);
  } else if (key == 'B') {
    changeState(STATE_CONN_PREFERENCE);
  } else if (key == 'C') {
    changeState(STATE_CONN_INFO);
  } else if (key == '*') {
    changeState(STATE_IDLE);
  }
}

// ─── WIFI SCAN ────────────────────────────────────────────────────────

void handleWifiScanState(char key) {
  if (previousState != STATE_WIFI_SCAN) {
    previousState = STATE_WIFI_SCAN;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Scanning WiFi...");
    lcd.setCursor(0, 1);
    lcd.print("Please wait");

    // Perform WiFi scan
    wifiScanCount = connManager.scanWifi(wifiScanSSIDs, wifiScanRSSI, MAX_WIFI_SCAN_RESULTS);
    wifiSelectIndex = 0;

    if (wifiScanCount == 0) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("No WiFi found");
      lcd.setCursor(0, 1);
      lcd.print("B=Manual *=Back");
    } else {
      changeState(STATE_WIFI_SELECT);
    }
  }

  // Only reachable if no networks found
  if (key == 'B') {
    keypadInput.begin("SSID:", 32, false);
    changeState(STATE_WIFI_SSID_ENTRY);
  } else if (key == '*') {
    changeState(STATE_SETTINGS);
  }
}

// ─── WIFI SELECT (scroll through scan results) ───────────────────────

void handleWifiSelectState(char key) {
  if (previousState != STATE_WIFI_SELECT) {
    previousState = STATE_WIFI_SELECT;
  }

  // Always redraw (index may have changed)
  static int lastDrawnIndex = -1;
  if (lastDrawnIndex != wifiSelectIndex) {
    lastDrawnIndex = wifiSelectIndex;
    lcd.clear();
    lcd.setCursor(0, 0);

    // Show current SSID (truncate to 16 chars)
    String ssid = wifiScanSSIDs[wifiSelectIndex];
    if (ssid.length() > 16) ssid = ssid.substring(0, 16);
    lcd.print(ssid);

    lcd.setCursor(0, 1);
    lcd.printf("%ddBm %d/%d #=OK", wifiScanRSSI[wifiSelectIndex],
               wifiSelectIndex + 1, wifiScanCount);
  }

  if (key == '2' || key == 'A') {
    // Scroll up
    if (wifiSelectIndex > 0) wifiSelectIndex--;
  } else if (key == '8' || key == 'C') {
    // Scroll down
    if (wifiSelectIndex < wifiScanCount - 1) wifiSelectIndex++;
  } else if (key == '#') {
    // Select this network
    wifiSelectedSSID = wifiScanSSIDs[wifiSelectIndex];
    lastDrawnIndex = -1;
    keypadInput.begin("Password:", 63, true);
    changeState(STATE_WIFI_PASSWORD);
  } else if (key == 'B') {
    // Manual SSID entry
    lastDrawnIndex = -1;
    keypadInput.begin("SSID:", 32, false);
    changeState(STATE_WIFI_SSID_ENTRY);
  } else if (key == '*') {
    lastDrawnIndex = -1;
    changeState(STATE_SETTINGS);
  }
}

// ─── WIFI SSID MANUAL ENTRY (multi-tap) ──────────────────────────────

void handleWifiSsidEntryState(char key) {
  if (previousState != STATE_WIFI_SSID_ENTRY) {
    previousState = STATE_WIFI_SSID_ENTRY;
    // Initial draw
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(keypadInput.getLine0());
    lcd.setCursor(0, 1);
    lcd.print(keypadInput.getLine1());
  }

  // Feed key to multi-tap input
  if (key) {
    KeypadInputResult result = keypadInput.feedKey(key);
    if (result == KI_CONFIRMED) {
      wifiSelectedSSID = keypadInput.getText();
      if (wifiSelectedSSID.length() > 0) {
        keypadInput.begin("Password:", 63, true);
        changeState(STATE_WIFI_PASSWORD);
      }
      return;
    } else if (result == KI_CANCELLED) {
      changeState(STATE_SETTINGS);
      return;
    }
  }

  // Update LCD if needed
  if (keypadInput.needsRedraw()) {
    lcd.setCursor(0, 0);
    lcd.print(keypadInput.getLine0());
    lcd.setCursor(0, 1);
    lcd.print(keypadInput.getLine1());
  }
}

// ─── WIFI PASSWORD ENTRY (multi-tap, masked) ─────────────────────────

void handleWifiPasswordState(char key) {
  if (previousState != STATE_WIFI_PASSWORD) {
    previousState = STATE_WIFI_PASSWORD;
    // Initial draw
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(keypadInput.getLine0());
    lcd.setCursor(0, 1);
    lcd.print(keypadInput.getLine1());
  }

  if (key) {
    KeypadInputResult result = keypadInput.feedKey(key);
    if (result == KI_CONFIRMED) {
      String password = keypadInput.getText();
      // Save credentials and attempt connection
      connManager.setWifiCredentials(wifiSelectedSSID, password);
      changeState(STATE_WIFI_CONNECTING);
      return;
    } else if (result == KI_CANCELLED) {
      // Go back to scan/select
      changeState(STATE_WIFI_SCAN);
      return;
    }
  }

  if (keypadInput.needsRedraw()) {
    lcd.setCursor(0, 0);
    lcd.print(keypadInput.getLine0());
    lcd.setCursor(0, 1);
    lcd.print(keypadInput.getLine1());
  }
}

// ─── WIFI CONNECTING ──────────────────────────────────────────────────

void handleWifiConnectingState(char key) {
  static bool connectionAttempted = false;
  static bool showingResult = false;

  if (previousState != STATE_WIFI_CONNECTING) {
    previousState = STATE_WIFI_CONNECTING;
    connectionAttempted = false;
    showingResult = false;

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting WiFi");
    lcd.setCursor(0, 1);

    String ssid = wifiSelectedSSID;
    if (ssid.length() > 16) ssid = ssid.substring(0, 16);
    lcd.print(ssid);
  }

  // Attempt connection once (blocks ~15s with watchdog feeds inside)
  if (!connectionAttempted) {
    connectionAttempted = true;
    connManager.connectWifi();  // Blocks up to WIFI_CONNECT_TIMEOUT_MS

    // Show result immediately after blocking call returns
    lcd.clear();
    lcd.setCursor(0, 0);

    if (connManager.wifi()->isConnected()) {
      lcd.print("WiFi Connected!");
      lcd.setCursor(0, 1);
      lcd.printf("IP:%s", connManager.wifi()->getIPAddress().substring(0, 15).c_str());
      showingResult = true;
      stateEnteredMs = millis();  // Reset for result display timeout
    } else {
      lcd.print("WiFi Failed");
      lcd.setCursor(0, 1);
      lcd.print("#=Retry *=Back");
      showingResult = false;
    }
    return;
  }

  // If showing success, auto-return to IDLE after 2s
  if (showingResult) {
    if (millis() - stateEnteredMs > 2000) {
      changeState(STATE_IDLE);
    }
    return;
  }

  // Showing failure — wait for user input
  if (key == '#') {
    // Retry — reset state to trigger another attempt
    connectionAttempted = false;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting WiFi");
    lcd.setCursor(0, 1);
    String ssid = wifiSelectedSSID;
    if (ssid.length() > 16) ssid = ssid.substring(0, 16);
    lcd.print(ssid);
  } else if (key == '*') {
    changeState(STATE_SETTINGS);
  }
}

// ─── CONNECTION PREFERENCE ────────────────────────────────────────────

void handleConnPreferenceState(char key) {
  if (previousState != STATE_CONN_PREFERENCE) {
    previousState = STATE_CONN_PREFERENCE;
    lcd.clear();
    lcd.setCursor(0, 0);
    ConnPreference pref = connManager.getPreference();
    lcd.printf("Now: %s first", pref == PREF_WIFI_FIRST ? "WiFi" : "GSM");
    lcd.setCursor(0, 1);
    lcd.print("A=WiFi B=GSM *=X");
  }

  if (key == 'A') {
    connManager.setPreference(PREF_WIFI_FIRST);
    lcd.setCursor(0, 0);
    lcd.print("Set: WiFi first ");
    delay(1000);
    changeState(STATE_SETTINGS);
  } else if (key == 'B') {
    connManager.setPreference(PREF_GSM_FIRST);
    lcd.setCursor(0, 0);
    lcd.print("Set: GSM first  ");
    delay(1000);
    changeState(STATE_SETTINGS);
  } else if (key == '*') {
    changeState(STATE_SETTINGS);
  }
}

// ─── CONNECTION INFO ──────────────────────────────────────────────────

void handleConnInfoState(char key) {
  if (previousState != STATE_CONN_INFO) {
    previousState = STATE_CONN_INFO;
    lcd.clear();
    lcd.setCursor(0, 0);

    if (connManager.isConnected()) {
      String transport = connManager.getTransportName();
      lcd.printf("%s %ddBm", transport.c_str(), connManager.getRSSI());
      lcd.setCursor(0, 1);
      if (connManager.getActive() == CONN_WIFI) {
        // Show IP
        String ip = connManager.wifi()->getIPAddress();
        if (ip.length() > 16) ip = ip.substring(0, 16);
        lcd.print(ip);
      } else {
        lcd.print("GPRS Active");
      }
    } else {
      lcd.print("Not Connected");
      lcd.setCursor(0, 1);
      String ssid = connManager.getWifiSSID();
      if (ssid.length() > 0) {
        lcd.printf("WiFi:%s", ssid.substring(0, 11).c_str());
      } else {
        lcd.print("No WiFi config");
      }
    }
  }

  // Any key goes back
  if (key) {
    changeState(STATE_SETTINGS);
  }
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

