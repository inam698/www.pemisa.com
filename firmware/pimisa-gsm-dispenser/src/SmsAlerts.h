// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// SmsAlerts.h - Critical Event SMS Alert System
//
// Queues and sends SMS alerts for critical events:
//   - Low oil level warning
//   - System errors
//   - Transaction receipts (optional)
//
// Alerts are rate-limited per type to prevent spam. A simple
// FIFO queue holds up to 5 pending alerts, processed one at a
// time since the SIM800L can only send one SMS concurrently.
//
// Non-blocking: call update() every loop iteration.
// ============================================================
#pragma once
#include <Arduino.h>
#include "Config.h"

// Forward declaration
class GSMManager;

// ---- Alert types -------------------------------------------
enum class AlertType : uint8_t {
    LOW_OIL,
    ERROR,
    TRANSACTION
};

// ---- Queued alert record -----------------------------------
struct PendingAlert {
    AlertType type;
    String    message;
    bool      active;       // true = slot in use
};

// ---- Cooldown durations ------------------------------------
static const unsigned long COOLDOWN_LOW_OIL_MS   = 3600000UL;  // 1 hour
static const unsigned long COOLDOWN_ERROR_MS      =  600000UL;  // 10 minutes
static const unsigned long COOLDOWN_TRANSACTION_MS =       0UL;  // No cooldown

// ---- Queue capacity ----------------------------------------
static const uint8_t SMS_QUEUE_SIZE = 5;

// ============================================================
class SmsAlerts {
public:
    SmsAlerts();

    // Call once in setup()
    void begin();

    // Inject GSM dependency
    void setGsm(GSMManager* gsm);

    // Call every loop() - processes pending alerts
    void update();

    // ---- Alert triggers ------------------------------------

    // Queue a low oil warning (rate-limited to once per hour)
    void alertLowOil(float remainingMl);

    // Queue an error alert (rate-limited to once per 10 min)
    void alertError(const String& errorMsg);

    // Queue a transaction receipt SMS (optional, no cooldown)
    void alertTransaction(const String& voucherCode, float litres, float amount);

    // ---- Status --------------------------------------------
    uint8_t getPendingAlertCount() const;

private:
    // ---- Dependencies ----------------------------------------
    GSMManager* _gsm;

    // ---- Alert queue (simple circular FIFO) ------------------
    PendingAlert _queue[SMS_QUEUE_SIZE];
    uint8_t      _queueHead;    // Next slot to write
    uint8_t      _queueTail;    // Next slot to send

    // ---- Cooldown tracking per alert type --------------------
    unsigned long _lastLowOilMs;
    unsigned long _lastErrorMs;

    // ---- Send state ------------------------------------------
    bool _smsBusy;              // True while GSM is sending

    // ---- Internal helpers ------------------------------------
    bool enqueue(AlertType type, const String& message);
    void processNext();
    String formatTimestamp() const;
};
