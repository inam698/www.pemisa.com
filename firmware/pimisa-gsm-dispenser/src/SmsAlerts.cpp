// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// SmsAlerts.cpp - Critical Event SMS Alert System
//
// Processes a FIFO queue of SMS alerts, sending one at a time
// through the GSMManager. Each alert type has an independent
// cooldown to prevent flooding the admin phone.
//
// All SMS messages include the device ID and a timestamp for
// easy identification in multi-unit deployments.
// ============================================================
#include "SmsAlerts.h"
#include "GSMManager.h"

static const char* TAG = "SMS";

// ---- Constructor -------------------------------------------
SmsAlerts::SmsAlerts()
    : _gsm(nullptr),
      _queueHead(0),
      _queueTail(0),
      _lastLowOilMs(0),
      _lastErrorMs(0),
      _smsBusy(false)
{
    for (uint8_t i = 0; i < SMS_QUEUE_SIZE; i++) {
        _queue[i].active = false;
    }
}

// ---- begin() -----------------------------------------------
void SmsAlerts::begin() {
    LOG(TAG, "SmsAlerts initialised");
    LOGF(TAG, "Admin phone: %s", ADMIN_PHONE);
    LOGF(TAG, "Low oil alerts: %s, Error alerts: %s",
         SMS_ON_LOW_OIL ? "ON" : "OFF",
         SMS_ON_ERROR   ? "ON" : "OFF");
}

// ---- setGsm() ----------------------------------------------
void SmsAlerts::setGsm(GSMManager* gsm) {
    _gsm = gsm;
    LOG(TAG, "GSM dependency set");
}

// ---- update() - called every loop() -----------------------
void SmsAlerts::update() {
    if (!_gsm || _smsBusy) return;

    // Process the next pending alert in the queue
    processNext();
}

// ---- alertLowOil() -----------------------------------------
void SmsAlerts::alertLowOil(float remainingMl) {
    if (!SMS_ON_LOW_OIL) return;

    // Enforce cooldown: max once per hour
    unsigned long now = millis();
    if (_lastLowOilMs != 0 && (now - _lastLowOilMs) < COOLDOWN_LOW_OIL_MS) {
        return;
    }

    String msg = String("[") + DEVICE_ID + "] " + formatTimestamp() + "\n"
               + "LOW OIL WARNING\n"
               + "Remaining: " + String(remainingMl, 0) + " mL\n"
               + "Threshold: " + String(LOW_OIL_THRESHOLD_ML, 0) + " mL\n"
               + "Please refill soon.";

    if (enqueue(AlertType::LOW_OIL, msg)) {
        _lastLowOilMs = now;
        LOGF(TAG, "Low oil alert queued (%.0f mL remaining)", remainingMl);
    }
}

// ---- alertError() ------------------------------------------
void SmsAlerts::alertError(const String& errorMsg) {
    if (!SMS_ON_ERROR) return;

    // Enforce cooldown: max once per 10 minutes
    unsigned long now = millis();
    if (_lastErrorMs != 0 && (now - _lastErrorMs) < COOLDOWN_ERROR_MS) {
        return;
    }

    String msg = String("[") + DEVICE_ID + "] " + formatTimestamp() + "\n"
               + "ERROR ALERT\n"
               + errorMsg;

    if (enqueue(AlertType::ERROR, msg)) {
        _lastErrorMs = now;
        LOGF(TAG, "Error alert queued: %s", errorMsg.c_str());
    }
}

// ---- alertTransaction() ------------------------------------
void SmsAlerts::alertTransaction(const String& voucherCode, float litres, float amount) {
    String msg = String("[") + DEVICE_ID + "] " + formatTimestamp() + "\n"
               + "DISPENSE RECEIPT\n"
               + "Voucher: " + voucherCode + "\n"
               + "Volume: " + String(litres, 2) + " L\n"
               + "Amount: P" + String(amount, 2);

    if (enqueue(AlertType::TRANSACTION, msg)) {
        LOGF(TAG, "Transaction receipt queued: %s %.2fL", voucherCode.c_str(), litres);
    }
}

// ---- getPendingAlertCount() --------------------------------
uint8_t SmsAlerts::getPendingAlertCount() const {
    uint8_t count = 0;
    for (uint8_t i = 0; i < SMS_QUEUE_SIZE; i++) {
        if (_queue[i].active) count++;
    }
    return count;
}

// ---- enqueue() - add alert to FIFO queue -------------------
bool SmsAlerts::enqueue(AlertType type, const String& message) {
    // Check if queue is full
    if (_queue[_queueHead].active) {
        LOG(TAG, "Alert queue full, dropping alert");
        return false;
    }

    _queue[_queueHead].type    = type;
    _queue[_queueHead].message = message;
    _queue[_queueHead].active  = true;

    _queueHead = (_queueHead + 1) % SMS_QUEUE_SIZE;
    return true;
}

// ---- processNext() - send the oldest pending alert ---------
void SmsAlerts::processNext() {
    // Find the next active slot at _queueTail
    if (!_queue[_queueTail].active) return;

    if (!_gsm->isReady()) return;

    String& message = _queue[_queueTail].message;

    LOGF(TAG, "Sending SMS to %s (%u chars)", ADMIN_PHONE, message.length());

    _smsBusy = true;

    bool queued = _gsm->sendSms(String(ADMIN_PHONE), message);

    if (queued) {
        // Mark slot as free and advance tail
        _queue[_queueTail].active  = false;
        _queue[_queueTail].message = "";   // Free memory
        _queueTail = (_queueTail + 1) % SMS_QUEUE_SIZE;

        // GSM sendSms is fire-and-forget from our perspective;
        // the GSM state machine handles the actual send.
        // We add a small guard to avoid hammering back-to-back.
        _smsBusy = false;
    } else {
        LOG(TAG, "GSM busy, will retry next loop");
        _smsBusy = false;
    }
}

// ---- formatTimestamp() - human-readable uptime string ------
String SmsAlerts::formatTimestamp() const {
    unsigned long sec = millis() / 1000;
    unsigned long min = sec / 60;
    unsigned long hrs = min / 60;

    char buf[16];
    snprintf(buf, sizeof(buf), "%02luh%02lum%02lus", hrs, min % 60, sec % 60);
    return String(buf);
}
