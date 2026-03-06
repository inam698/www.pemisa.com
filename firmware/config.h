/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  PIMISA IoT OIL DISPENSER - ESP32 FIRMWARE                 ║
 * ║  Configuration File                                         ║
 * ║                                                              ║
 * ║  Scalable architecture: 1000+ dispensers across stations.   ║
 * ║  Supports OTA updates, NVS persistence, adaptive heartbeat. ║
 * ║                                                              ║
 * ║  IMPORTANT: Update these values before flashing to device.  ║
 * ║  Get DEVICE_ID and API_KEY from the admin dashboard after   ║
 * ║  registering the machine.                                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#ifndef CONFIG_H
#define CONFIG_H

// ─── WiFi Configuration ─────────────────────────────────────────
#define WIFI_SSID           "TP-Link_4B76"
#define WIFI_PASSWORD       "73005780"
#define WIFI_CONNECT_TIMEOUT_MS  15000   // Max time to wait for WiFi
#define WIFI_RECONNECT_INTERVAL  5000    // Retry interval on disconnect

// ─── Pimisa Cloud Server ────────────────────────────────────────
#define SERVER_BASE_URL     "https://your-pimisa-server.com"
#define API_TIMEOUT_MS      10000  // HTTP request timeout
#define API_MAX_RETRIES     3      // Number of retry attempts
#define API_RETRY_DELAY_MS  2000   // Base delay between retries

// ─── Device Credentials (from admin dashboard) ──────────────────
// These are generated when you register a machine in the dashboard.
// Navigate to Admin > Machines > Register Machine to obtain them.
#define DEVICE_ID           "DISP-XXXX-XXXX"
#define API_KEY             "pimisa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

// ─── Hardware Pins ──────────────────────────────────────────────
#define FLOW_SENSOR_PIN     4      // Flow sensor signal pin (interrupt-capable)
#define PUMP_RELAY_PIN      23     // Relay controlling the 12V oil pump
#define KEYPAD_ROW_PINS     {27, 14, 12, 13}  // 4x4 keypad row pins
#define KEYPAD_COL_PINS     {32, 35, 25, 26}  // 4x4 keypad column pins (NOTE: GPIO35 input-only)
#define LCD_I2C_ADDR        0x27   // I2C address for 16x2 LCD
#define LCD_COLS            16
#define LCD_ROWS            2
#define OIL_LEVEL_PIN       34     // Analog pin for oil tank level sensor
#define TEMP_SENSOR_PIN     35     // Analog pin for temperature sensor (NTC/DS18B20)

// ─── Flow Sensor Calibration ────────────────────────────────────
// Pulses per litre - MUST be calibrated for your specific sensor.
// AICHI OF05ZAT: ~2174 pulses/litre (typical)
// YF-S201:       ~450 pulses/litre (typical)
#define PULSES_PER_LITRE    450.0f
#define FLOW_TOLERANCE      0.02f  // ±20ml tolerance

// ─── Oil Price Configuration ────────────────────────────────────
// Default price per litre in ZMW. Can be updated from server.
#define DEFAULT_PRICE_PER_LITRE  45.0f

// ─── Heartbeat Configuration ────────────────────────────────────
// Server can override this during heartbeat response.
// At 1000 devices × 1/30s = ~33 heartbeats/s — acceptable for server.
#define HEARTBEAT_INTERVAL_MS    30000  // 30 seconds (server-adjustable)
#define MIN_HEARTBEAT_MS         10000  // Floor: don't allow < 10s
#define MAX_HEARTBEAT_MS         300000 // Ceiling: don't allow > 5 min
#define TELEMETRY_INTERVAL_MS    300000 // Full telemetry snapshot every 5 min

// ─── Safety Configuration ───────────────────────────────────────
#define MAX_DISPENSE_LITRES      50.0f  // Safety cap per transaction
#define MAX_DISPENSE_TIME_MS     300000 // 5 minutes max pump run time
#define FLOW_TIMEOUT_MS          5000   // No-flow timeout during dispensing

// ─── OTA (Over-The-Air) Update Settings ─────────────────────────
// OTA is triggered when server heartbeat response includes ota_update.
// The device downloads .bin from the URL and flashes to the OTA partition.
#define OTA_CHECK_INTERVAL_MS    3600000 // Check every 1 hour if no server push
#define OTA_MAX_RETRIES          3       // Max download retries before giving up
#define OTA_RETRY_DELAY_MS       60000   // Wait 60s between retries

// ─── NVS (Non-Volatile Storage) ─────────────────────────────────
// Offline sales persist across power outages using ESP32 NVS flash.
#define NVS_ENABLED              true
#define NVS_OFFLINE_RETRY_MS     60000   // Retry uploading offline sales every 60s

// ─── Firmware Version ───────────────────────────────────────────
#define FIRMWARE_VERSION    "2.2.0"

#endif // CONFIG_H
