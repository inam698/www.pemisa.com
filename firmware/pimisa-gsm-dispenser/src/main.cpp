// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// main.cpp - Application State Machine & Entry Point
//
// Ties all modules together into a cooperative state machine:
//   - Keypad input -> voucher / cash / litre flow
//   - Pump + flow sensor dispensing loop
//   - GSM transaction reporting + offline queue retry
//   - Heartbeat telemetry + SMS alerts
//   - ESP32 hardware watchdog for production reliability
//
// All blocking is avoided. Every module is driven via its
// update() method on each loop() iteration.
// ============================================================
#include <Arduino.h>
#include <esp_task_wdt.h>

#include "Config.h"
#include "GSMManager.h"
#include "FlowSensor.h"
#include "PumpController.h"
#include "KeypadManager.h"
#include "DisplayManager.h"
#include "VoucherManager.h"
#include "StorageManager.h"
#include "HeartbeatService.h"
#include "SmsAlerts.h"

// ============================================================
// Application State Machine
// ============================================================
enum class AppState : uint8_t {
    BOOT,               // System initialization
    IDLE,               // Main screen, waiting for input
    SELECT_MODE,        // User chose A=Voucher, B=Cash, C=BuyLitres
    VOUCHER_PHONE,      // Enter phone number
    VOUCHER_CODE,       // Enter voucher code
    VALIDATING,         // Waiting for server/cache response
    APPROVED,           // Show voucher details, confirm to dispense
    CASH_AMOUNT,        // Enter amount in ZMW
    BUY_LITRES,         // Enter litres directly
    CONFIRM_DISPENSE,   // Confirm before pumping
    DISPENSING,         // Pump running, flow sensor counting
    COMPLETE,           // Show receipt, auto-return to IDLE
    ERROR,              // Show error, return to IDLE
    SENDING,            // Reporting transaction to server
    OFFLINE_QUEUED      // Transaction queued for later
};

// ---- Human-readable state name (debug) ----------------------
static const char* appStateName(AppState s) {
    switch (s) {
        case AppState::BOOT:            return "BOOT";
        case AppState::IDLE:            return "IDLE";
        case AppState::SELECT_MODE:     return "SELECT_MODE";
        case AppState::VOUCHER_PHONE:   return "VOUCHER_PHONE";
        case AppState::VOUCHER_CODE:    return "VOUCHER_CODE";
        case AppState::VALIDATING:      return "VALIDATING";
        case AppState::APPROVED:        return "APPROVED";
        case AppState::CASH_AMOUNT:     return "CASH_AMOUNT";
        case AppState::BUY_LITRES:      return "BUY_LITRES";
        case AppState::CONFIRM_DISPENSE:return "CONFIRM_DISPENSE";
        case AppState::DISPENSING:      return "DISPENSING";
        case AppState::COMPLETE:        return "COMPLETE";
        case AppState::ERROR:           return "ERROR";
        case AppState::SENDING:         return "SENDING";
        case AppState::OFFLINE_QUEUED:  return "OFFLINE_QUEUED";
        default:                        return "UNKNOWN";
    }
}

// ============================================================
// Transaction Mode (how the user initiated dispensing)
// ============================================================
enum class TxnMode : uint8_t {
    NONE,
    VOUCHER,
    CASH,
    BUY_LITRES
};

// ============================================================
// Global Module Instances (standard embedded pattern)
// ============================================================
static GSMManager       gsm;
static FlowSensor       flowSensor;
static PumpController   pump;
static KeypadManager    keypad;
static DisplayManager   display;
static VoucherManager   voucherMgr;
static StorageManager   storage;
static HeartbeatService heartbeat;
static SmsAlerts        smsAlerts;

// ============================================================
// Application State
// ============================================================
static AppState      appState         = AppState::BOOT;
static AppState      prevAppState     = AppState::BOOT;
static unsigned long stateEnterMs     = 0;
static TxnMode       txnMode         = TxnMode::NONE;

// ---- Transaction context ------------------------------------
static String   voucherPhone;
static String   voucherCode;
static float    targetLitres         = 0.0f;
static float    targetMl             = 0.0f;
static float    txnAmount            = 0.0f;  // ZMW
static String   beneficiaryName;

// ---- Lifetime counters (persisted in NVS) -------------------
static float    totalLitresDispensed = 0.0f;
static uint32_t totalPumpCycles      = 0;
static float    pricePerLitre        = 45.0f;  // ZMW, loaded from NVS

// ---- Offline queue retry timer ------------------------------
static unsigned long lastOfflineRetryMs = 0;

// ---- Auto-return timers (ms) --------------------------------
static constexpr unsigned long COMPLETE_DISPLAY_MS  = 8000;
static constexpr unsigned long ERROR_DISPLAY_MS     = 5000;
static constexpr unsigned long OFFLINE_DISPLAY_MS   = 4000;
static constexpr unsigned long BOOT_SPLASH_MS       = 2000;

// ---- Low-oil alert tracking ---------------------------------
static bool lowOilAlertSent = false;

// ============================================================
// Forward Declarations
// ============================================================
static void transitionTo(AppState next);
static void handleBoot();
static void handleIdle();
static void handleSelectMode();
static void handleVoucherPhone();
static void handleVoucherCode();
static void handleValidating();
static void handleApproved();
static void handleCashAmount();
static void handleBuyLitres();
static void handleConfirmDispense();
static void handleDispensing();
static void handleComplete();
static void handleError();
static void handleSending();
static void handleOfflineQueued();
static void backgroundTasks();
static void resetTransactionContext();
static void reportTransaction();
static void onKeyPress(char key);
static void onConfirm(const String& buffer);

// ============================================================
// State Transition Helper
// ============================================================
static void transitionTo(AppState next) {
    LOGF("APP", "State: %s -> %s", appStateName(appState), appStateName(next));
    prevAppState  = appState;
    appState      = next;
    stateEnterMs  = millis();
}

// ============================================================
// Reset Transaction Context
// ============================================================
static void resetTransactionContext() {
    txnMode         = TxnMode::NONE;
    voucherPhone    = "";
    voucherCode     = "";
    targetLitres    = 0.0f;
    targetMl        = 0.0f;
    txnAmount       = 0.0f;
    beneficiaryName = "";
    keypad.clearBuffer();
    keypad.setEnabled(true);
}

// ============================================================
// setup() - One-time initialization
// ============================================================
void setup() {
    // ---- Serial debug console --------------------------------
    Serial.begin(115200);
    delay(100);
    Serial.println();
    Serial.println("============================================================");
    Serial.println(" PIMISA IoT Cooking Oil Dispenser");
    Serial.println(" Firmware " FIRMWARE_VERSION " / Hardware " HARDWARE_VERSION);
    Serial.println(" Device:  " DEVICE_ID);
    Serial.println("============================================================");

    // ---- Hardware watchdog -----------------------------------
    LOG("APP", "Configuring hardware watchdog...");
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);  // true = panic on timeout
    esp_task_wdt_add(NULL);  // Add current task (loopTask)
    LOG("APP", "Watchdog armed");

    // ---- Initialize all modules ------------------------------
    LOG("APP", "Initializing modules...");

    display.begin();
    display.showBoot();

    storage.begin();

    // Load persistent data from NVS
    storage.loadLifetimeStats(totalLitresDispensed, totalPumpCycles);
    pricePerLitre = storage.loadPricePerLitre();
    LOGF("APP", "Lifetime: %.2f L dispensed, %lu pump cycles",
         totalLitresDispensed, (unsigned long)totalPumpCycles);
    LOGF("APP", "Price per litre: %.2f ZMW", pricePerLitre);

    flowSensor.begin();
    pump.begin();

    keypad.begin();
    keypad.onKeyPress(onKeyPress);
    keypad.onConfirm(onConfirm);
    keypad.setEnabled(false);  // Disabled until IDLE

    gsm.begin();

    // Wire up inter-module dependencies
    voucherMgr.begin();
    voucherMgr.setGsm(&gsm);
    voucherMgr.setStorage(&storage);

    heartbeat.begin();
    heartbeat.setDependencies(&gsm, &flowSensor);
    heartbeat.setTotalLitres(totalLitresDispensed);
    heartbeat.setPumpCycles(totalPumpCycles);

    smsAlerts.begin();
    smsAlerts.setGsm(&gsm);

    LOG("APP", "All modules initialized");

    // Begin boot state
    transitionTo(AppState::BOOT);
}

// ============================================================
// loop() - Main application loop
// ============================================================
void loop() {
    // ---- Feed watchdog ---------------------------------------
    esp_task_wdt_reset();

    // ---- Update all modules ----------------------------------
    gsm.update();
    keypad.update();
    display.update();
    flowSensor.update();
    pump.update();
    voucherMgr.update();

    // ---- Background tasks (always run) -----------------------
    backgroundTasks();

    // ---- State machine dispatcher ----------------------------
    switch (appState) {
        case AppState::BOOT:            handleBoot();           break;
        case AppState::IDLE:            handleIdle();           break;
        case AppState::SELECT_MODE:     handleSelectMode();     break;
        case AppState::VOUCHER_PHONE:   handleVoucherPhone();   break;
        case AppState::VOUCHER_CODE:    handleVoucherCode();    break;
        case AppState::VALIDATING:      handleValidating();     break;
        case AppState::APPROVED:        handleApproved();       break;
        case AppState::CASH_AMOUNT:     handleCashAmount();     break;
        case AppState::BUY_LITRES:      handleBuyLitres();      break;
        case AppState::CONFIRM_DISPENSE:handleConfirmDispense();break;
        case AppState::DISPENSING:      handleDispensing();     break;
        case AppState::COMPLETE:        handleComplete();       break;
        case AppState::ERROR:           handleError();          break;
        case AppState::SENDING:         handleSending();        break;
        case AppState::OFFLINE_QUEUED:  handleOfflineQueued();  break;
    }
}

// ============================================================
// Background Tasks (run every loop regardless of state)
// ============================================================
static void backgroundTasks() {
    // ---- Heartbeat telemetry ---------------------------------
    heartbeat.update();

    // ---- SMS alerts ------------------------------------------
    smsAlerts.update();

    // ---- Low oil check ---------------------------------------
    float remaining = flowSensor.getRemainingMl();
    if (remaining > 0.0f && remaining < LOW_OIL_THRESHOLD_ML && !lowOilAlertSent) {
        LOG("APP", "Low oil level detected!");
        smsAlerts.alertLowOil(remaining);
        lowOilAlertSent = true;
    }

    // ---- Offline queue retry ---------------------------------
    if (gsm.isReady() && !storage.isEmpty()) {
        unsigned long now = millis();
        if (now - lastOfflineRetryMs >= OFFLINE_RETRY_MS) {
            lastOfflineRetryMs = now;
            LOGF("APP", "Retrying offline queue (%d pending)", storage.getCount());
            voucherMgr.processOfflineRedemptions();
        }
    }
}

// ============================================================
// BOOT State - System Initialization
// ============================================================
static void handleBoot() {
    unsigned long elapsed = millis() - stateEnterMs;

    // Show splash screen for minimum duration
    if (elapsed < BOOT_SPLASH_MS) return;

    // Wait for GSM module to become ready (with timeout)
    if (gsm.isReady()) {
        LOGF("APP", "GSM ready. Signal: %d/31", gsm.getSignalQuality());
        transitionTo(AppState::IDLE);
        return;
    }

    // GSM init timeout - proceed anyway (offline mode)
    if (elapsed >= GSM_REG_TIMEOUT_MS) {
        LOG("APP", "GSM timeout - entering offline mode");
        display.showMessage("GSM Timeout", "Offline mode");
        transitionTo(AppState::IDLE);
        return;
    }

    // Show GSM wait status periodically
    if (elapsed > BOOT_SPLASH_MS) {
        display.showMessage("Connecting GSM..", gsm.getStateName());
    }
}

// ============================================================
// IDLE State - Main Screen, Waiting for Input
// ============================================================
static void handleIdle() {
    // One-time entry setup
    if (prevAppState != AppState::IDLE || stateEnterMs == millis()) {
        resetTransactionContext();
        display.showIdle();
        display.showNetworkStatus(gsm.isReady(), gsm.getSignalQuality());
        keypad.setEnabled(true);
    }

    // Periodically refresh network status on display
    static unsigned long lastNetRefreshMs = 0;
    if (millis() - lastNetRefreshMs >= NETWORK_CHECK_MS) {
        lastNetRefreshMs = millis();
        display.showNetworkStatus(gsm.isReady(), gsm.getSignalQuality());
    }
}

// ============================================================
// Keypad Callbacks (active in all input states)
// ============================================================

// Called on every key press
static void onKeyPress(char key) {
    LOGF("KEY", "Key pressed: '%c' (state=%s)", key, appStateName(appState));
    display.beep();

    // ---- Mode selection keys (A/B/C/D) ----------------------
    if (appState == AppState::IDLE) {
        switch (key) {
            case 'A':
                LOGF("APP", "Mode selected: VOUCHER");
                txnMode = TxnMode::VOUCHER;
                transitionTo(AppState::VOUCHER_PHONE);
                return;
            case 'B':
                LOGF("APP", "Mode selected: CASH");
                txnMode = TxnMode::CASH;
                transitionTo(AppState::CASH_AMOUNT);
                return;
            case 'C':
                LOGF("APP", "Mode selected: BUY_LITRES");
                txnMode = TxnMode::BUY_LITRES;
                transitionTo(AppState::BUY_LITRES);
                return;
            case 'D':
                // D key = show network status
                display.showNetworkStatus(gsm.isReady(), gsm.getSignalQuality());
                return;
            default:
                break;
        }
    }

    // ---- Emergency stop during dispensing --------------------
    if (appState == AppState::DISPENSING && key == '*') {
        LOG("APP", "Emergency stop requested by operator");
        pump.emergencyStop();
        flowSensor.update();  // Capture final reading
        display.showError("E-STOP by user");
        transitionTo(AppState::ERROR);
        return;
    }

    // ---- Cancel (* key) in input/confirm states --------
    if (key == '*') {
        switch (appState) {
            case AppState::VOUCHER_PHONE:
            case AppState::VOUCHER_CODE:
            case AppState::CASH_AMOUNT:
            case AppState::BUY_LITRES:
            case AppState::APPROVED:
            case AppState::CONFIRM_DISPENSE:
                // If buffer is empty, cancel entirely; otherwise backspace
                if (keypad.getBuffer().length() == 0) {
                    LOG("APP", "Cancelled by user");
                    transitionTo(AppState::IDLE);
                }
                // Backspace is handled internally by KeypadManager
                return;
            default:
                break;
        }
    }

    // ---- Update display with current input ------------------
    switch (appState) {
        case AppState::VOUCHER_PHONE:
            display.showInput(keypad.getBuffer());
            break;
        case AppState::VOUCHER_CODE:
            display.showInput(keypad.getBuffer());
            break;
        case AppState::CASH_AMOUNT:
            display.showInput(keypad.getBuffer());
            break;
        case AppState::BUY_LITRES:
            display.showInput(keypad.getBuffer());
            break;
        default:
            break;
    }
}

// Called when '#' is pressed (confirm / submit)
static void onConfirm(const String& buffer) {
    LOGF("KEY", "Confirm pressed. Buffer='%s' (state=%s)",
         buffer.c_str(), appStateName(appState));

    switch (appState) {
        // ---- Voucher phone entry ----------------------------
        case AppState::VOUCHER_PHONE: {
            if (buffer.length() < 6) {
                display.showMessage("Phone too short", "Try again");
                keypad.clearBuffer();
                return;
            }
            voucherPhone = buffer;
            LOGF("APP", "Phone entered: %s", voucherPhone.c_str());
            keypad.clearBuffer();
            transitionTo(AppState::VOUCHER_CODE);
            break;
        }

        // ---- Voucher code entry -----------------------------
        case AppState::VOUCHER_CODE: {
            if (buffer.length() < 4) {
                display.showMessage("Code too short", "Try again");
                keypad.clearBuffer();
                return;
            }
            voucherCode = buffer;
            LOGF("APP", "Voucher code entered: %s", voucherCode.c_str());
            keypad.clearBuffer();
            keypad.setEnabled(false);
            transitionTo(AppState::VALIDATING);
            break;
        }

        // ---- Cash amount entry ------------------------------
        case AppState::CASH_AMOUNT: {
            float amount = buffer.toFloat();
            if (amount <= 0.0f) {
                display.showMessage("Invalid amount", "Try again");
                keypad.clearBuffer();
                return;
            }
            txnAmount    = amount;
            targetLitres = amount / pricePerLitre;
            targetMl     = targetLitres * 1000.0f;

            // Clamp to max dispense
            if (targetMl > MAX_DISPENSE_ML) {
                targetMl     = MAX_DISPENSE_ML;
                targetLitres = targetMl / 1000.0f;
                txnAmount    = targetLitres * pricePerLitre;
            }

            // Enforce minimum
            if (targetMl < MIN_DISPENSE_ML) {
                display.showMessage("Amount too small", "Min 50 mL");
                keypad.clearBuffer();
                return;
            }

            LOGF("APP", "Cash: %.2f ZMW -> %.2f L (%.0f mL)",
                 txnAmount, targetLitres, targetMl);
            keypad.clearBuffer();
            transitionTo(AppState::CONFIRM_DISPENSE);
            break;
        }

        // ---- Buy litres entry -------------------------------
        case AppState::BUY_LITRES: {
            float litres = buffer.toFloat();
            if (litres <= 0.0f) {
                display.showMessage("Invalid litres", "Try again");
                keypad.clearBuffer();
                return;
            }
            targetLitres = litres;
            targetMl     = targetLitres * 1000.0f;
            txnAmount    = targetLitres * pricePerLitre;

            // Clamp to max dispense
            if (targetMl > MAX_DISPENSE_ML) {
                targetMl     = MAX_DISPENSE_ML;
                targetLitres = targetMl / 1000.0f;
                txnAmount    = targetLitres * pricePerLitre;
            }

            // Enforce minimum
            if (targetMl < MIN_DISPENSE_ML) {
                display.showMessage("Too little", "Min 50 mL");
                keypad.clearBuffer();
                return;
            }

            LOGF("APP", "Buy: %.2f L (%.0f mL) = %.2f ZMW",
                 targetLitres, targetMl, txnAmount);
            keypad.clearBuffer();
            transitionTo(AppState::CONFIRM_DISPENSE);
            break;
        }

        // ---- Approve voucher -> start dispense --------------
        case AppState::APPROVED: {
            LOG("APP", "Voucher approved - proceeding to dispense");
            transitionTo(AppState::CONFIRM_DISPENSE);
            break;
        }

        // ---- Confirm dispense -> start pump -----------------
        case AppState::CONFIRM_DISPENSE: {
            LOG("APP", "Dispense confirmed by user");
            transitionTo(AppState::DISPENSING);
            break;
        }

        default:
            break;
    }
}

// ============================================================
// VOUCHER_PHONE State - Enter Phone Number
// ============================================================
static void handleVoucherPhone() {
    // One-time entry
    if (prevAppState != AppState::VOUCHER_PHONE) {
        prevAppState = AppState::VOUCHER_PHONE;
        keypad.clearBuffer();
        keypad.setEnabled(true);
        display.showMessage("Enter Phone:", "#=OK *=Back");
    }

    // Show current input
    if (keypad.getBuffer().length() > 0) {
        display.showInput(keypad.getBuffer());
    }

    // Idle timeout -> return to IDLE
    if (keypad.isIdle()) {
        LOG("APP", "Input timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// VOUCHER_CODE State - Enter Voucher Code
// ============================================================
static void handleVoucherCode() {
    // One-time entry
    if (prevAppState != AppState::VOUCHER_CODE) {
        prevAppState = AppState::VOUCHER_CODE;
        keypad.clearBuffer();
        keypad.setEnabled(true);
        display.showMessage("Enter Code:", "#=OK *=Back");
    }

    // Show current input
    if (keypad.getBuffer().length() > 0) {
        display.showInput(keypad.getBuffer());
    }

    // Idle timeout
    if (keypad.isIdle()) {
        LOG("APP", "Input timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// VALIDATING State - Wait for Voucher Server Response
// ============================================================
static void handleValidating() {
    // One-time entry: fire off the verification request
    if (prevAppState != AppState::VALIDATING) {
        prevAppState = AppState::VALIDATING;
        display.showValidating();

        bool started = voucherMgr.verify(voucherPhone, voucherCode);
        if (!started) {
            LOG("APP", "Failed to start voucher verification");
            display.showError("Verify failed");
            transitionTo(AppState::ERROR);
            return;
        }
        LOG("APP", "Voucher verification started");
    }

    // Poll for result
    if (voucherMgr.hasResult()) {
        const VoucherResult& result = voucherMgr.getResult();

        if (result.valid) {
            LOGF("APP", "Voucher VALID: %s, %.2f L, %.2f ZMW",
                 result.beneficiaryName, result.litres, result.amount);

            beneficiaryName = result.beneficiaryName;
            targetLitres    = result.litres;
            targetMl        = targetLitres * 1000.0f;
            txnAmount       = result.amount;

            // Clamp to max dispense
            if (targetMl > MAX_DISPENSE_ML) {
                targetMl     = MAX_DISPENSE_ML;
                targetLitres = targetMl / 1000.0f;
                LOGF("APP", "Clamped to max: %.0f mL", targetMl);
            }

            transitionTo(AppState::APPROVED);
        } else {
            LOGF("APP", "Voucher INVALID: %s", result.message);
            display.showError(result.message);
            transitionTo(AppState::ERROR);
        }
    }

    // Timeout waiting for server
    if (millis() - stateEnterMs >= API_TIMEOUT_MS + 5000) {
        LOG("APP", "Validation timeout");
        display.showError("Server timeout");
        transitionTo(AppState::ERROR);
    }
}

// ============================================================
// APPROVED State - Show Voucher Details, Confirm to Dispense
// ============================================================
static void handleApproved() {
    // One-time entry
    if (prevAppState != AppState::APPROVED) {
        prevAppState = AppState::APPROVED;
        keypad.setEnabled(true);
        keypad.clearBuffer();

        // Line 1: beneficiary name (truncated to 16 chars)
        // Line 2: litres + amount
        char line2[17];
        snprintf(line2, sizeof(line2), "%.1fL K%.0f #=GO", targetLitres, txnAmount);
        display.showMessage(beneficiaryName.substring(0, LCD_COLS), line2);
        display.beepSuccess();

        const VoucherResult& result = voucherMgr.getResult();
        if (result.fromCache) {
            LOG("APP", "Note: Voucher validated from OFFLINE cache");
        }
    }

    // Idle timeout
    if (keypad.isIdle()) {
        LOG("APP", "Approval timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// CASH_AMOUNT State - Enter Amount in ZMW
// ============================================================
static void handleCashAmount() {
    // One-time entry
    if (prevAppState != AppState::CASH_AMOUNT) {
        prevAppState = AppState::CASH_AMOUNT;
        keypad.clearBuffer();
        keypad.setEnabled(true);
        char line2[17];
        snprintf(line2, sizeof(line2), "K%.0f/L #=OK", pricePerLitre);
        display.showMessage("Amount (ZMW):", line2);
    }

    if (keypad.getBuffer().length() > 0) {
        display.showInput(keypad.getBuffer());
    }

    // Idle timeout
    if (keypad.isIdle()) {
        LOG("APP", "Input timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// BUY_LITRES State - Enter Litres Directly
// ============================================================
static void handleBuyLitres() {
    // One-time entry
    if (prevAppState != AppState::BUY_LITRES) {
        prevAppState = AppState::BUY_LITRES;
        keypad.clearBuffer();
        keypad.setEnabled(true);
        display.showMessage("Litres:", "#=OK *=Back");
    }

    if (keypad.getBuffer().length() > 0) {
        display.showInput(keypad.getBuffer());
    }

    // Idle timeout
    if (keypad.isIdle()) {
        LOG("APP", "Input timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// CONFIRM_DISPENSE State - Final Confirmation Before Pumping
// ============================================================
static void handleConfirmDispense() {
    // One-time entry
    if (prevAppState != AppState::CONFIRM_DISPENSE) {
        prevAppState = AppState::CONFIRM_DISPENSE;
        keypad.clearBuffer();
        keypad.setEnabled(true);

        char line1[17];
        snprintf(line1, sizeof(line1), "Dispense %.2fL?", targetLitres);
        display.showMessage(line1, "#=YES *=CANCEL");

        LOGF("APP", "Confirm dispense: %.2f L (%.0f mL)", targetLitres, targetMl);
    }

    // Idle timeout
    if (keypad.isIdle()) {
        LOG("APP", "Confirm timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// SELECT_MODE State (handled inline via keypad callback)
// ============================================================
static void handleSelectMode() {
    // This state is transient - the keypad callback routes
    // directly to the appropriate input state. If we somehow
    // end up here, show the menu.
    display.showMessage("A=Voucher B=Cash", "C=Litres D=Info");
}

// ============================================================
// DISPENSING State - Pump Running, Flow Sensor Counting
// ============================================================
static void handleDispensing() {
    // One-time entry: start pump and reset flow sensor
    if (prevAppState != AppState::DISPENSING) {
        prevAppState = AppState::DISPENSING;
        keypad.setEnabled(true);  // Allow '*' for emergency stop

        // Validate target before starting
        if (targetMl < MIN_DISPENSE_ML) {
            LOG("APP", "Target below minimum - aborting");
            display.showError("Target too low");
            transitionTo(AppState::ERROR);
            return;
        }

        flowSensor.resetVolume();
        pump.clearError();
        pump.start(targetMl);

        display.showDispensing(0.0f, targetMl);
        LOGF("APP", "Dispensing started: target=%.0f mL", targetMl);
    }

    // ---- Feed flow sensor data to pump controller -----------
    float currentMl = flowSensor.getVolumeMl();
    pump.setDispensedMl(currentMl);

    // ---- Update display with progress -----------------------
    display.showDispensing(currentMl, targetMl);

    // ---- Check for completion: target reached ---------------
    if (pump.isTargetReached() || !pump.isRunning()) {
        if (pump.isError()) {
            LOG("APP", "Pump error during dispensing");
            pump.stop();
            display.showError("Pump timeout!");
            smsAlerts.alertError("Pump safety timeout during dispense");
            transitionTo(AppState::ERROR);
            return;
        }

        // Normal completion
        float dispensedMl = flowSensor.getVolumeMl();
        float dispensedL  = dispensedMl / 1000.0f;
        pump.stop();

        LOGF("APP", "Dispense complete: %.0f mL (%.3f L)", dispensedMl, dispensedL);

        // Update lifetime counters
        totalLitresDispensed += dispensedL;
        totalPumpCycles++;
        storage.saveLifetimeStats(totalLitresDispensed, totalPumpCycles);
        heartbeat.setTotalLitres(totalLitresDispensed);
        heartbeat.setPumpCycles(totalPumpCycles);

        // Decrement estimated tank level
        flowSensor.decrementRemaining(dispensedMl);
        heartbeat.setOilLevelMl(flowSensor.getRemainingMl());

        // Show completion screen
        display.showComplete(dispensedMl);
        transitionTo(AppState::COMPLETE);
    }

    // ---- Flow sensor stall detection ------------------------
    // If pump is running but no flow for extended period, error out
    if (pump.isRunning() && pump.getRunTimeMs() > 5000 && flowSensor.hasFlowStopped(3000)) {
        LOG("APP", "Flow stall detected - no flow for 3 seconds");
        pump.emergencyStop();
        display.showError("No flow detected");
        smsAlerts.alertError("Flow stall - no oil flowing");
        transitionTo(AppState::ERROR);
    }
}

// ============================================================
// COMPLETE State - Show Receipt, Report Transaction
// ============================================================
static void handleComplete() {
    // One-time entry: report transaction to server
    if (prevAppState != AppState::COMPLETE) {
        prevAppState = AppState::COMPLETE;
        reportTransaction();
    }

    // Auto-return to IDLE after display time
    if (millis() - stateEnterMs >= COMPLETE_DISPLAY_MS) {
        LOG("APP", "Complete timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// ERROR State - Show Error, Auto-Return to IDLE
// ============================================================
static void handleError() {
    if (prevAppState != AppState::ERROR) {
        prevAppState = AppState::ERROR;
        // Ensure pump is off
        if (pump.isRunning()) {
            pump.emergencyStop();
        }
        keypad.setEnabled(false);
    }

    // Auto-return to IDLE after error display
    if (millis() - stateEnterMs >= ERROR_DISPLAY_MS) {
        LOG("APP", "Error timeout - returning to IDLE");
        pump.clearError();
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// SENDING State - Posting Transaction to Server
// ============================================================
static void handleSending() {
    if (prevAppState != AppState::SENDING) {
        prevAppState = AppState::SENDING;
        display.showSending();
    }

    // The actual send is async via GSM callbacks.
    // If GSM finishes or we timeout, move on.
    if (!gsm.isBusy()) {
        transitionTo(AppState::IDLE);
    }

    if (millis() - stateEnterMs >= API_TIMEOUT_MS + 5000) {
        LOG("APP", "Send timeout - transaction may be queued offline");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// OFFLINE_QUEUED State - Transaction Saved for Later
// ============================================================
static void handleOfflineQueued() {
    if (prevAppState != AppState::OFFLINE_QUEUED) {
        prevAppState = AppState::OFFLINE_QUEUED;
        display.showOfflineQueued(storage.getCount());
    }

    // Auto-return to IDLE
    if (millis() - stateEnterMs >= OFFLINE_DISPLAY_MS) {
        LOG("APP", "Offline queued display timeout - returning to IDLE");
        transitionTo(AppState::IDLE);
    }
}

// ============================================================
// Transaction Reporting
// ============================================================
static void reportTransaction() {
    float dispensedMl = flowSensor.getVolumeMl();
    float dispensedL  = dispensedMl / 1000.0f;

    LOGF("APP", "Reporting transaction: mode=%d, %.3f L, %.2f ZMW",
         (int)txnMode, dispensedL, txnAmount);

    switch (txnMode) {
        case TxnMode::VOUCHER: {
            // Report voucher redemption
            bool sent = voucherMgr.redeem(voucherCode, dispensedL);
            if (sent) {
                LOG("APP", "Voucher redemption sent to server");
            } else {
                LOG("APP", "Voucher redemption queued offline");
                display.showOfflineQueued(storage.getCount());
            }
            break;
        }

        case TxnMode::CASH:
        case TxnMode::BUY_LITRES: {
            // Build and enqueue cash/litres transaction
            OfflineTransaction txn = {};
            strncpy(txn.type,
                    txnMode == TxnMode::CASH ? "cash" : "litres",
                    sizeof(txn.type) - 1);
            strncpy(txn.deviceId, DEVICE_ID, sizeof(txn.deviceId) - 1);
            txn.litresDispensed = dispensedL;
            txn.amount          = txnAmount;
            txn.timestamp       = millis();
            txn.retryCount      = 0;

            if (gsm.isReady()) {
                // Build JSON and POST directly
                StaticJsonDocument<256> doc;
                doc["type"]       = txn.type;
                doc["deviceId"]   = DEVICE_ID;
                doc["litres"]     = dispensedL;
                doc["amount"]     = txnAmount;
                doc["timestamp"]  = txn.timestamp;

                String jsonBody;
                serializeJson(doc, jsonBody);

                String url = String(API_USE_SSL ? "https://" : "http://") + API_HOST + API_ENDPOINT_TXNS;

                gsm.httpPost(url, jsonBody, [](HttpResponse& resp) {
                    if (resp.success) {
                        LOG("APP", "Cash transaction reported successfully");
                    } else {
                        LOGF("APP", "Cash transaction report failed: %d", resp.statusCode);
                        // Will be retried via offline queue on next background pass
                    }
                });

                LOG("APP", "Cash transaction sent to server");
            } else {
                // Offline - enqueue for later
                if (storage.enqueue(txn)) {
                    LOGF("APP", "Transaction queued offline (%d in queue)",
                         storage.getCount());
                } else {
                    LOG("APP", "OFFLINE QUEUE FULL - transaction lost!");
                    smsAlerts.alertError("Offline queue full - transaction lost");
                }
            }
            break;
        }

        default:
            LOG("APP", "Unknown transaction mode - not reporting");
            break;
    }
}
