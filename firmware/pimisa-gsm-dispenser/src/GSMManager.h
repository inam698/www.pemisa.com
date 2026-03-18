// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// GSMManager.h - SIM800L GSM/GPRS Manager
//
// Handles all SIM800L communication:
//   - AT command engine with non-blocking state machine
//   - GPRS bearer management (connect/disconnect)
//   - HTTP POST / GET requests (no external library)
//   - SMS alerts
//   - Signal quality and network registration
//
// Design: Command queue + response parser, no blocking delays.
// The caller must call update() on every loop iteration.
// ============================================================
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "Config.h"

// ---- HTTP Response container --------------------------------
struct HttpResponse {
    int     statusCode;     // e.g. 200, 400, 500
    String  body;           // Response body (JSON text)
    bool    success;        // true if statusCode 200-299
};

// ---- SMS structure ------------------------------------------
struct SmsMessage {
    String recipient;   // Phone number in international format
    String text;        // SMS body
};

// ---- GSM internal states ------------------------------------
enum class GsmState : uint8_t {
    OFF,
    POWERING_ON,
    WAIT_READY,
    SEND_AT,
    DISABLE_ECHO,
    SET_SMS_MODE,
    CHECK_SIM,
    WAIT_NETWORK,
    GET_SIGNAL,
    GPRS_ATTACH,
    BEARER_SET_CONTYPE,
    BEARER_SET_APN,
    BEARER_SET_USER,
    BEARER_SET_PASS,
    BEARER_OPEN,
    BEARER_WAIT,
    READY,              // Network + GPRS ready
    // --- HTTP states ---
    HTTP_INIT,
    HTTP_SET_CID,
    HTTP_SET_SSL,
    HTTP_SET_URL,
    HTTP_SET_CONTENT,
    HTTP_SET_USERDATA,
    HTTP_SEND_DATA,
    HTTP_DATA_WAIT,
    HTTP_ACTION,
    HTTP_ACTION_WAIT,
    HTTP_READ,
    HTTP_TERM,
    HTTP_DONE,
    // --- SMS states ---
    SMS_SET_MODE,
    SMS_SET_RECIP,
    SMS_SEND_TEXT,
    SMS_WAIT_PROMPT,
    SMS_SEND_BODY,
    SMS_DONE,
    // --- Error ---
    ERROR,
    REINIT
};

// ---- Callback types -----------------------------------------
using HttpCallback = std::function<void(HttpResponse&)>;
using VoidCallback = std::function<void()>;

// ---- Pending operation types --------------------------------
enum class GsmOperation : uint8_t {
    NONE,
    HTTP_POST,
    HTTP_GET,
    SEND_SMS
};

// ============================================================
class GSMManager {
public:
    GSMManager();

    // Call once in setup()
    void begin();

    // Call every loop() - drives the internal state machine
    void update();

    // ---- Network Status -----
    bool isReady() const { return _state == GsmState::READY || isHttpBusy(); }
    bool isNetworkReady() const { return _networkReady; }
    bool isGprsReady() const   { return _gprsReady; }
    bool isBusy() const        { return _operation != GsmOperation::NONE; }
    bool isHttpBusy() const    { return _state >= GsmState::HTTP_INIT && _state <= GsmState::HTTP_DONE; }
    int  getSignalQuality() const { return _signalQuality; }  // 0-31, 99=unknown

    // ---- HTTP Operations ----
    // Enqueue an HTTP POST. Callback fires when complete (or on error).
    // Returns false if already busy.
    bool httpPost(const String& url, const String& jsonBody, HttpCallback cb);

    // Enqueue an HTTP GET.
    bool httpGet(const String& url, HttpCallback cb);

    // ---- SMS Operations ----
    // Enqueue an SMS. Returns false if already busy.
    bool sendSms(const String& phone, const String& message);

    // ---- Utility ----
    // Force re-initialize (e.g., after error)
    void reset();

    // Hardware reset pulse on RST pin
    void hardReset();

    // Raw AT command for debugging
    void sendRaw(const String& cmd);

    // Get human-readable state name
    const char* getStateName() const;

private:
    // ---- Serial port ----------------------------------------
    HardwareSerial& _serial;

    // ---- State machine fields --------------------------------
    GsmState     _state;
    GsmState     _prevState;
    unsigned long _stateEnterMs;   // When did we enter current state?
    unsigned long _cmdTimeout;     // Timeout for current state (ms)
    uint8_t      _retryCount;
    uint8_t      _initStep;        // Sub-step for init sequence

    // ---- Status flags ----------------------------------------
    bool  _networkReady;
    bool  _gprsReady;
    bool  _bearerOpen;
    int   _signalQuality;    // RSSI value from AT+CSQ

    // ---- Pending operation -----------------------------------
    GsmOperation _operation;
    String       _pendingUrl;
    String       _pendingBody;
    String       _pendingPhone;
    String       _pendingSmsTxt;
    HttpCallback _httpCallback;
    HttpResponse _httpResponse;
    int          _httpDataLen;  // Length of JSON body to send
    bool         _isPostRequest;

    // ---- AT response buffer ----------------------------------
    String       _rxBuf;
    unsigned long _lastCharMs;

    // ---- Internal AT command engine --------------------------
    void transitionTo(GsmState next, unsigned long timeoutMs = GSM_CMD_TIMEOUT_MS);
    void sendCmd(const String& cmd);
    bool waitFor(const String& expected, const String& errorStr = "ERROR");
    bool rxContains(const String& token);
    bool rxContains(const char* token);
    void clearRx();

    // ---- State handlers (called from update()) ---------------
    void handlePowerOn();
    void handleWaitReady();
    void handleSendAT();
    void handleDisableEcho();
    void handleSetSmsMode();
    void handleCheckSim();
    void handleWaitNetwork();
    void handleGetSignal();
    void handleGprsAttach();
    void handleBearerSetContype();
    void handleBearerSetApn();
    void handleBearerSetUser();
    void handleBearerSetPass();
    void handleBearerOpen();
    void handleBearerWait();
    void handleReady();
    void handleHttpInit();
    void handleHttpSetCid();
    void handleHttpSetSsl();
    void handleHttpSetUrl();
    void handleHttpSetContent();
    void handleHttpSetUserData();
    void handleHttpSendData();
    void handleHttpDataWait();
    void handleHttpAction();
    void handleHttpActionWait();
    void handleHttpRead();
    void handleHttpTerm();
    void handleSmsSend();
    void handleError();

    // ---- Timer helper ----------------------------------------
    bool timedOut() const {
        return (millis() - _stateEnterMs) >= _cmdTimeout;
    }
};
