// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// Config.h - System-wide pin definitions and constants
//
// All hardware pin assignments, timing constants, and feature
// flags are centralized here for easy maintenance and porting.
// ============================================================
#pragma once
#include <Arduino.h>

// ---- Device Identity ----------------------------------------
// Machine: Oil Dispenser #1 — Lusaka Station 1
#define DEVICE_ID           "DISP-7281-89E6"
#define FIRMWARE_VERSION    "1.0.0-gsm"
#define HARDWARE_VERSION    "REV-A"

// ---- SIM800L GSM Module (UART2) ----------------------------
// SIM800L requires 3.7-4.2V power supply (NOT 3.3V or 5V)
// Use a dedicated LiPo or buck converter rated 2A minimum.
#define GSM_TX_PIN          17     // ESP32 TX2 -> SIM800L RX
#define GSM_RX_PIN          16     // ESP32 RX2 <- SIM800L TX
#define GSM_RST_PIN         5      // Active LOW reset
#define GSM_BAUD_RATE       9600
#define GSM_UART_NUM        2      // Use Serial2

// ---- YF-S201 Flow Sensor -----------------------------------
// Pulse frequency is proportional to flow rate.
// Calibration: 450 pulses = 1 litre (factory default)
// Verify with your specific sensor unit and recalibrate if needed.
#define FLOW_SENSOR_PIN     34     // Must support interrupts (input-only on ESP32)
#define FLOW_PULSES_PER_L   450.0f // Pulses per litre (YF-S201)
#define FLOW_DEBOUNCE_US    2000   // Microseconds debounce for ISR
#define LOW_OIL_THRESHOLD_ML 300.0f // Trigger SMS alert below this level

// ---- Pump Control (Relay / MOSFET) -------------------------
// If using relay: PUMP_ACTIVE_HIGH = true
// If using MOSFET (N-channel, gate tied to GPIO): PUMP_ACTIVE_HIGH = true
#define PUMP_PIN            26
#define PUMP_ACTIVE_HIGH    true
#define PUMP_MAX_ON_MS      90000UL  // Safety cutoff: 90 seconds
#define MAX_DISPENSE_ML     2000.0f  // Max 2 litres per transaction
#define MIN_DISPENSE_ML     50.0f    // Minimum 50ml per dispense

// ---- Buzzer (optional) -------------------------------------
#define BUZZER_PIN          27
#define BUZZER_ENABLED      true
#define BUZZ_SHORT_MS       100
#define BUZZ_LONG_MS        500

// ---- 4x4 Matrix Keypad -------------------------------------
// Wiring order: R1..R4 are row pins, C1..C4 are column pins
#define KEYPAD_ROWS         4
#define KEYPAD_COLS         4
// Row pins (driven as output)
#define KP_R1               32
#define KP_R2               33
#define KP_R3               25
#define KP_R4               13
// Column pins (read as input with pull-up)
#define KP_C1               12
#define KP_C2               14
#define KP_C3               15
#define KP_C4               2
#define KEYPAD_MAX_LEN      12   // Maximum voucher code length
#define KEYPAD_DEBOUNCE_MS  50

// ---- I2C LCD Display (16x2) --------------------------------
// Use I2C scanner sketch to confirm address (0x27 or 0x3F)
#define LCD_ADDRESS         0x27
#define LCD_COLS            16
#define LCD_ROWS            2
// ESP32 default I2C pins (can be overridden in Wire.begin())
#define LCD_SDA_PIN         21
#define LCD_SCL_PIN         22

// ---- API / Network -----------------------------------------
// Replace with your actual server details
#define APN                 "internet"         // SIM carrier APN
#define APN_USER            ""                 // APN username (blank if none)
#define APN_PASS            ""                 // APN password (blank if none)
#define API_HOST            "pimisa-voucher-system.vercel.app"
#define API_PORT            443
#define API_USE_SSL         true       // SIM800L: AT+HTTPSSL=1
#define API_ENDPOINT_VALIDATE "/api/voucher/verify"
#define API_ENDPOINT_REDEEM   "/api/voucher/redeem"
#define API_ENDPOINT_TXNS     "/api/device/transaction"
#define API_ENDPOINT_HEARTBEAT "/api/device/heartbeat"
#define API_SECRET_KEY      "pimisa_633084d7e23469b059ec1785d084b9714419515e08d714bf2be8c06ef3f107b0"

// ---- Timeouts & Retry Logic --------------------------------
#define API_TIMEOUT_MS      20000UL   // HTTP response timeout
#define GSM_CMD_TIMEOUT_MS  5000UL    // AT command response timeout
#define GSM_INIT_TIMEOUT_MS 30000UL   // Module boot timeout
#define GSM_REG_TIMEOUT_MS  60000UL   // Network registration timeout
#define HTTP_RETRY_COUNT    3
#define HTTP_RETRY_DELAY_MS 5000UL
#define OFFLINE_RETRY_MS    120000UL  // Retry offline queue every 2 min

// ---- SMS Alerts --------------------------------------------
#define ADMIN_PHONE         "+260963020583"
#define SMS_ON_LOW_OIL      true
#define SMS_ON_ERROR        true

// ---- Storage (SPIFFS Offline Queue) ------------------------
#define OFFLINE_QUEUE_FILE  "/queue.json"
#define MAX_OFFLINE_QUEUE   20    // Max pending transactions
#define PREFS_NAMESPACE     "pimisa"

// ---- System Timing -----------------------------------------
#define IDLE_TIMEOUT_MS     30000UL   // Return to IDLE after inactivity
#define DISPLAY_UPDATE_MS   300UL     // LCD refresh rate
#define HEARTBEAT_INTERVAL  300000UL  // Heartbeat every 5 minutes
#define NETWORK_CHECK_MS    60000UL   // Network health check interval
#define WATCHDOG_TIMEOUT_S  30        // Hardware watchdog (seconds)

// ---- Debug / Logging ---------------------------------------
#ifndef DEBUG_DISABLED
  #define DEBUG_ENABLED 1
#endif

#if DEBUG_ENABLED
  #define LOG(tag, msg)       Serial.printf("[%s] %s\n", tag, msg)
  #define LOGF(tag, fmt, ...) Serial.printf("[%s] " fmt "\n", tag, ##__VA_ARGS__)
  #define LOG_HEX(tag, buf, len) do { \
    Serial.printf("[%s] HEX: ", tag); \
    for(int _i=0;_i<(int)(len);_i++) Serial.printf("%02X ", ((uint8_t*)(buf))[_i]); \
    Serial.println(); \
  } while(0)
#else
  #define LOG(tag, msg)
  #define LOGF(tag, fmt, ...)
  #define LOG_HEX(tag, buf, len)
#endif
