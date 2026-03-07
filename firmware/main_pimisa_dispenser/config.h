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
#define WIFI_SSID           "TP-LINK_4B74"
#define WIFI_PASSWORD       "73005780"
#define WIFI_CONNECT_TIMEOUT_MS  15000   // Max time to wait for WiFi
#define WIFI_RECONNECT_INTERVAL  5000    // Retry interval on disconnect

// ─── Pimisa Cloud Server ────────────────────────────────────────
#define SERVER_BASE_URL     "https://pimisa-voucher-system.vercel.app"
#define API_TIMEOUT_MS      10000  // HTTP request timeout
#define API_MAX_RETRIES     3      // Number of retry attempts
#define API_RETRY_DELAY_MS  2000   // Base delay between retries

// ─── Device Credentials (from admin dashboard) ──────────────────
// These are generated when you register a machine in the dashboard.
// Navigate to Admin > Machines > Register Machine to obtain them.
#define DEVICE_ID           "DISP-LSK-001"
#define API_KEY             "pimisa_9c9c78160941a342189fbfa95f507e619add19572343028a"

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

// ─── Watchdog Timer ─────────────────────────────────────────
// Hardware watchdog resets ESP32 if loop() hangs for too long.
#define WDT_TIMEOUT_SECONDS  30     // Reset if no feed for 30s

// ─── SSL/TLS Configuration ──────────────────────────────────
// Set to true in production to verify server certificate.
// When true, the root CA cert below is used to validate the server.
#define SSL_VERIFY_SERVER    true

// Let's Encrypt ISRG Root X1 — used by Vercel/most HTTPS hosts.
// Expires: Mon, 04 Jun 2035. Replace if your server uses a different CA.
static const char* ROOT_CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogZiUvsE0PEKKNF+54PRtotXIHKbOeY1Y3LBEPHaHuNACri
Bts2LbshBnpp1bMCnIomR02xEjEaKhLBEFG6IYJjqllisWMUTf1M11GhCgQDCmSF
jOIeLhMrNMVr4kj3JLVZ99Fg24FMKAO4LiC8bJChFYUsxxqnMbm2rpWI9Ed6T4CO
Sn8rI7wR500L2CIGvGNKIIiJYRGuVFC6SVAO6bSVXzY4mWN2MFHG3DlKNnoH0JjH
FSp2xOlePGKbOVfjlLHzHL8YRSSWF+of1C8OLO6G5DtFcLFRLFkJdQ/8XljUIa5X
MTqZYXRz1x/EDTB7eCjz9U+rJsI/5gGEjhB4gpR2ewGqPFjnQ+lH9bgBxlEMZcM
lqCMiiXzqNR2VJlDYJE0qZnq1KnbRmBVGqBB2BOIAB5o91hbP0XqHk5FMmpBt1YK
oX+bR80Ko25NBkPGnLFKEj3SKqNaU+GhCZ//VBUzEH9F5AIT0b+adC5fJqawSw0=
-----END CERTIFICATE-----
)EOF";

// ─── Firmware Version ───────────────────────────────────────
#define FIRMWARE_VERSION    "2.3.0"

#endif // CONFIG_H
