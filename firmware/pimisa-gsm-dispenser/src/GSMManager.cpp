// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// GSMManager.cpp - SIM800L Non-Blocking State Machine
//
// AT Command reference (SIM800L):
//   AT             -> OK
//   ATE0           -> OK  (disable echo)
//   AT+CSQ         -> +CSQ: <rssi>,<ber>
//   AT+CREG?       -> +CREG: 0,1  (0,1 or 0,5 = registered)
//   AT+CGATT=1     -> OK  (attach GPRS)
//   AT+SAPBR=3,1,"Contype","GPRS" -> OK
//   AT+SAPBR=3,1,"APN","internet" -> OK
//   AT+SAPBR=1,1   -> OK  (open bearer)
//   AT+SAPBR=2,1   -> +SAPBR: 1,1,"<ip>"
//   AT+HTTPINIT    -> OK
//   AT+HTTPPARA="CID",1 -> OK
//   AT+HTTPPARA="URL","<url>" -> OK
//   AT+HTTPPARA="CONTENT","application/json" -> OK
//   AT+HTTPDATA=<len>,10000 -> DOWNLOAD
//   <body>         -> OK
//   AT+HTTPACTION=1 -> OK (then +HTTPACTION: 1,<status>,<bytes>)
//   AT+HTTPREAD    -> +HTTPREAD: <len>\r\n<data>
//   AT+HTTPTERM    -> OK
//   AT+CMGF=1      -> OK
//   AT+CMGS="+63..." -> > <prompt>
//   <text><Ctrl-Z> -> +CMGS: <id>
// ============================================================
#include "GSMManager.h"

// ---- Constructor -------------------------------------------
GSMManager::GSMManager()
    : _serial(Serial2),
      _state(GsmState::OFF),
      _prevState(GsmState::OFF),
      _stateEnterMs(0),
      _cmdTimeout(GSM_CMD_TIMEOUT_MS),
      _retryCount(0),
      _initStep(0),
      _networkReady(false),
      _gprsReady(false),
      _bearerOpen(false),
      _signalQuality(0),
      _operation(GsmOperation::NONE),
      _httpDataLen(0),
      _isPostRequest(true),
      _lastCharMs(0)
{}

// ---- begin() -----------------------------------------------
void GSMManager::begin() {
    pinMode(GSM_RST_PIN, OUTPUT);
    digitalWrite(GSM_RST_PIN, HIGH);  // Active LOW = not in reset

    _serial.begin(GSM_BAUD_RATE, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);
    _serial.setRxBufferSize(1024);

    LOGF("GSM", "GSMManager init. TX=%d RX=%d RST=%d", GSM_TX_PIN, GSM_RX_PIN, GSM_RST_PIN);
    transitionTo(GsmState::POWERING_ON, GSM_INIT_TIMEOUT_MS);
}

// ---- update() - Main non-blocking loop ---------------------
void GSMManager::update() {
    // Read all available bytes into buffer
    while (_serial.available()) {
        char c = _serial.read();
        _rxBuf += c;
        _lastCharMs = millis();
    }

    // Dispatch to current state handler
    switch (_state) {
        case GsmState::OFF:             break;
        case GsmState::POWERING_ON:     handlePowerOn();        break;
        case GsmState::WAIT_READY:      handleWaitReady();      break;
        case GsmState::SEND_AT:         handleSendAT();         break;
        case GsmState::DISABLE_ECHO:    handleDisableEcho();    break;
        case GsmState::SET_SMS_MODE:    handleSetSmsMode();     break;
        case GsmState::CHECK_SIM:       handleCheckSim();       break;
        case GsmState::WAIT_NETWORK:    handleWaitNetwork();    break;
        case GsmState::GET_SIGNAL:      handleGetSignal();      break;
        case GsmState::GPRS_ATTACH:     handleGprsAttach();     break;
        case GsmState::BEARER_SET_CONTYPE: handleBearerSetContype(); break;
        case GsmState::BEARER_SET_APN:  handleBearerSetApn();   break;
        case GsmState::BEARER_SET_USER: handleBearerSetUser();  break;
        case GsmState::BEARER_SET_PASS: handleBearerSetPass();  break;
        case GsmState::BEARER_OPEN:     handleBearerOpen();     break;
        case GsmState::BEARER_WAIT:     handleBearerWait();     break;
        case GsmState::READY:           handleReady();          break;
        case GsmState::HTTP_INIT:       handleHttpInit();       break;
        case GsmState::HTTP_SET_CID:    handleHttpSetCid();     break;
        case GsmState::HTTP_SET_SSL:    handleHttpSetSsl();     break;
        case GsmState::HTTP_SET_URL:    handleHttpSetUrl();     break;
        case GsmState::HTTP_SET_CONTENT: handleHttpSetContent(); break;
        case GsmState::HTTP_SET_USERDATA: handleHttpSetUserData(); break;
        case GsmState::HTTP_SEND_DATA:  handleHttpSendData();   break;
        case GsmState::HTTP_DATA_WAIT:  handleHttpDataWait();   break;
        case GsmState::HTTP_ACTION:     handleHttpAction();     break;
        case GsmState::HTTP_ACTION_WAIT: handleHttpActionWait(); break;
        case GsmState::HTTP_READ:       handleHttpRead();       break;
        case GsmState::HTTP_TERM:       handleHttpTerm();       break;
        case GsmState::SMS_SET_MODE:    // fall through
        case GsmState::SMS_SET_RECIP:   // fall through
        case GsmState::SMS_SEND_TEXT:   // fall through
        case GsmState::SMS_WAIT_PROMPT: // fall through
        case GsmState::SMS_SEND_BODY:   // fall through
        case GsmState::SMS_DONE:        handleSmsSend();        break;
        case GsmState::ERROR:           handleError();          break;
        case GsmState::REINIT:
            transitionTo(GsmState::POWERING_ON, GSM_INIT_TIMEOUT_MS);
            break;
        default: break;
    }
}

// ============================================================
// Public API
// ============================================================

bool GSMManager::httpPost(const String& url, const String& jsonBody, HttpCallback cb) {
    if (isBusy() || _state != GsmState::READY) {
        LOGF("GSM", "httpPost rejected: busy or not ready (state=%d)", (int)_state);
        return false;
    }
    _operation      = GsmOperation::HTTP_POST;
    _pendingUrl     = url;
    _pendingBody    = jsonBody;
    _httpCallback   = cb;
    _isPostRequest  = true;
    _httpResponse   = {0, "", false};
    _retryCount     = 0;
    transitionTo(GsmState::HTTP_INIT, API_TIMEOUT_MS);
    LOGF("GSM", "HTTP POST queued -> %s", url.c_str());
    return true;
}

bool GSMManager::httpGet(const String& url, HttpCallback cb) {
    if (isBusy() || _state != GsmState::READY) return false;
    _operation      = GsmOperation::HTTP_GET;
    _pendingUrl     = url;
    _pendingBody    = "";
    _httpCallback   = cb;
    _isPostRequest  = false;
    _httpResponse   = {0, "", false};
    _retryCount     = 0;
    transitionTo(GsmState::HTTP_INIT, API_TIMEOUT_MS);
    LOGF("GSM", "HTTP GET queued -> %s", url.c_str());
    return true;
}

bool GSMManager::sendSms(const String& phone, const String& message) {
    if (isBusy()) {
        LOGF("GSM", "sendSms rejected: busy");
        return false;
    }
    _operation      = GsmOperation::SEND_SMS;
    _pendingPhone   = phone;
    _pendingSmsTxt  = message;
    _retryCount     = 0;
    // If ready, go directly to SMS state, else queue will run after init
    if (_state == GsmState::READY) {
        transitionTo(GsmState::SMS_SET_MODE, GSM_CMD_TIMEOUT_MS);
    }
    LOGF("GSM", "SMS queued to %s", phone.c_str());
    return true;
}

void GSMManager::reset() {
    _operation    = GsmOperation::NONE;
    _networkReady = false;
    _gprsReady    = false;
    _bearerOpen   = false;
    clearRx();
    transitionTo(GsmState::REINIT, 1000);
}

void GSMManager::hardReset() {
    LOG("GSM", "Hardware reset pulse");
    digitalWrite(GSM_RST_PIN, LOW);
    delay(200);                       // 200ms reset pulse
    digitalWrite(GSM_RST_PIN, HIGH);
    delay(3000);                      // Wait for module boot
    clearRx();
    transitionTo(GsmState::SEND_AT, GSM_INIT_TIMEOUT_MS);
}

void GSMManager::sendRaw(const String& cmd) {
    _serial.println(cmd);
    LOGF("GSM", "RAW>> %s", cmd.c_str());
}

// ============================================================
// Internal Helpers
// ============================================================

void GSMManager::transitionTo(GsmState next, unsigned long timeoutMs) {
    LOGF("GSM", "State: %s -> %s", getStateName(),
        ([&]() -> const char* {
            // Inline name for next state
            switch (next) {
                case GsmState::POWERING_ON: return "POWERING_ON";
                case GsmState::WAIT_READY:  return "WAIT_READY";
                case GsmState::SEND_AT:     return "SEND_AT";
                case GsmState::DISABLE_ECHO:return "DISABLE_ECHO";
                case GsmState::READY:       return "READY";
                case GsmState::HTTP_INIT:   return "HTTP_INIT";
                case GsmState::HTTP_ACTION_WAIT: return "HTTP_ACTION_WAIT";
                case GsmState::ERROR:       return "ERROR";
                default:                    return "...";
            }
        })()
    );
    _prevState    = _state;
    _state        = next;
    _stateEnterMs = millis();
    _cmdTimeout   = timeoutMs;
    clearRx();
}

void GSMManager::sendCmd(const String& cmd) {
    _serial.println(cmd);
    LOGF("GSM", ">> %s", cmd.c_str());
}

bool GSMManager::rxContains(const String& token) {
    return _rxBuf.indexOf(token) != -1;
}

bool GSMManager::rxContains(const char* token) {
    return _rxBuf.indexOf(token) != -1;
}

void GSMManager::clearRx() {
    _rxBuf = "";
    // Flush hardware buffer
    while (_serial.available()) _serial.read();
}

// ============================================================
// State Handlers
// ============================================================

void GSMManager::handlePowerOn() {
    // Give module 3 seconds to boot, then start AT handshake
    if ((millis() - _stateEnterMs) > 3000) {
        transitionTo(GsmState::SEND_AT, GSM_INIT_TIMEOUT_MS);
    }
}

void GSMManager::handleWaitReady() {
    if (rxContains("RDY") || rxContains("Call Ready") || timedOut()) {
        transitionTo(GsmState::SEND_AT, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleSendAT() {
    // Send AT repeatedly until we get OK
    static unsigned long lastSentMs = 0;
    if (millis() - lastSentMs > 1000) {
        sendCmd("AT");
        lastSentMs = millis();
    }
    if (rxContains("OK")) {
        transitionTo(GsmState::DISABLE_ECHO, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        LOG("GSM", "AT timeout - hard reset");
        hardReset();
    }
}

void GSMManager::handleDisableEcho() {
    sendCmd("ATE0");
    transitionTo(GsmState::SET_SMS_MODE, GSM_CMD_TIMEOUT_MS);
}

void GSMManager::handleSetSmsMode() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+CMGF=1");
        return;
    }
    if (rxContains("OK") || rxContains("ERROR")) {
        transitionTo(GsmState::CHECK_SIM, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::CHECK_SIM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleCheckSim() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+CPIN?");
        return;
    }
    if (rxContains("READY")) {
        LOG("GSM", "SIM card OK");
        transitionTo(GsmState::WAIT_NETWORK, GSM_REG_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        LOG("GSM", "SIM card error or absent");
        transitionTo(GsmState::ERROR, 0);
    }
}

void GSMManager::handleWaitNetwork() {
    // Poll AT+CREG? every 2 seconds
    static unsigned long lastPollMs = 0;
    if (millis() - lastPollMs > 2000) {
        sendCmd("AT+CREG?");
        lastPollMs = millis();
    }
    // +CREG: 0,1 = registered home, +CREG: 0,5 = roaming
    if (rxContains(",1") || rxContains(",5")) {
        LOG("GSM", "Network registered");
        _networkReady = true;
        transitionTo(GsmState::GET_SIGNAL, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        LOG("GSM", "Network registration timeout");
        transitionTo(GsmState::ERROR, 0);
    }
}

void GSMManager::handleGetSignal() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+CSQ");
        return;
    }
    if (rxContains("+CSQ:")) {
        int idx = _rxBuf.indexOf("+CSQ: ");
        if (idx == -1) idx = _rxBuf.indexOf("+CSQ:");
        if (idx != -1) {
            _signalQuality = _rxBuf.substring(idx + 6, idx + 8).toInt();
            LOGF("GSM", "Signal quality: %d/31", _signalQuality);
        }
        transitionTo(GsmState::GPRS_ATTACH, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::GPRS_ATTACH, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleGprsAttach() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+CGATT=1");
        return;
    }
    if (rxContains("OK") || rxContains("+CGATT: 1")) {
        LOG("GSM", "GPRS attached");
        _gprsReady = true;
        transitionTo(GsmState::BEARER_SET_CONTYPE, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        LOGF("GSM", "GPRS attach failed (retry %d)", _retryCount);
        if (++_retryCount < 3) {
            clearRx();  // retry
        } else {
            transitionTo(GsmState::ERROR, 0);
        }
    }
}

void GSMManager::handleBearerSetContype() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
        return;
    }
    if (rxContains("OK") || rxContains("ERROR")) {
        transitionTo(GsmState::BEARER_SET_APN, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::BEARER_SET_APN, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleBearerSetApn() {
    if (_rxBuf.length() == 0) {
        String cmd = "AT+SAPBR=3,1,\"APN\",\"";
        cmd += APN;
        cmd += "\"";
        sendCmd(cmd);
        return;
    }
    if (rxContains("OK") || rxContains("ERROR")) {
        transitionTo(GsmState::BEARER_SET_USER, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::BEARER_SET_USER, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleBearerSetUser() {
    if (_rxBuf.length() == 0) {
        String cmd = "AT+SAPBR=3,1,\"USER\",\"";
        cmd += APN_USER;
        cmd += "\"";
        sendCmd(cmd);
        return;
    }
    if (rxContains("OK") || rxContains("ERROR")) {
        transitionTo(GsmState::BEARER_SET_PASS, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::BEARER_SET_PASS, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleBearerSetPass() {
    if (_rxBuf.length() == 0) {
        String cmd = "AT+SAPBR=3,1,\"PWD\",\"";
        cmd += APN_PASS;
        cmd += "\"";
        sendCmd(cmd);
        return;
    }
    if (rxContains("OK") || rxContains("ERROR")) {
        transitionTo(GsmState::BEARER_OPEN, 10000);
    } else if (timedOut()) {
        transitionTo(GsmState::BEARER_OPEN, 10000);
    }
}

void GSMManager::handleBearerOpen() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+SAPBR=1,1");
        return;
    }
    // Bearer open may return OK immediately or require polling
    if (rxContains("OK")) {
        transitionTo(GsmState::BEARER_WAIT, 10000);
    } else if (rxContains("ERROR")) {
        // Already open? Try bearer query
        sendCmd("AT+SAPBR=2,1");
        transitionTo(GsmState::BEARER_WAIT, 5000);
    } else if (timedOut()) {
        transitionTo(GsmState::BEARER_WAIT, 5000);
    }
}

void GSMManager::handleBearerWait() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+SAPBR=2,1");
        return;
    }
    // +SAPBR: 1,1,"<ip>" means connected
    if (rxContains("+SAPBR: 1,1,")) {
        LOG("GSM", "Bearer open - GPRS connected");
        _bearerOpen = true;
        transitionTo(GsmState::READY, 0);
        // If there's a pending operation, kick it off
    } else if (rxContains("+SAPBR: 1,3")) {
        LOG("GSM", "Bearer closed, retrying open");
        transitionTo(GsmState::BEARER_OPEN, 10000);
    } else if (timedOut()) {
        if (++_retryCount < 3) {
            clearRx();
        } else {
            transitionTo(GsmState::ERROR, 0);
        }
    }
}

void GSMManager::handleReady() {
    // Dispatch any pending operation
    if (_operation == GsmOperation::HTTP_POST || _operation == GsmOperation::HTTP_GET) {
        transitionTo(GsmState::HTTP_INIT, API_TIMEOUT_MS);
    } else if (_operation == GsmOperation::SEND_SMS) {
        transitionTo(GsmState::SMS_SET_MODE, GSM_CMD_TIMEOUT_MS);
    }
    // else just stay ready - periodic tasks handled by caller
}

// ============================================================
// HTTP State Handlers
// ============================================================

void GSMManager::handleHttpInit() {
    if (_rxBuf.length() == 0) {
        // First close any existing session
        sendCmd("AT+HTTPTERM");
        return;
    }
    // After HTTPTERM (OK or ERROR), start fresh
    if (rxContains("OK") || rxContains("ERROR")) {
        clearRx();
        sendCmd("AT+HTTPINIT");
        transitionTo(GsmState::HTTP_SET_CID, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        // Proceed anyway
        clearRx();
        sendCmd("AT+HTTPINIT");
        transitionTo(GsmState::HTTP_SET_CID, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpSetCid() {
    if (rxContains("OK")) {
        sendCmd("AT+HTTPPARA=\"CID\",1");
#if API_USE_SSL
        transitionTo(GsmState::HTTP_SET_SSL, GSM_CMD_TIMEOUT_MS);
#else
        transitionTo(GsmState::HTTP_SET_URL, GSM_CMD_TIMEOUT_MS);
#endif
    } else if (rxContains("ERROR") || timedOut()) {
        LOG("GSM", "HTTPINIT failed");
        _httpResponse = {0, "HTTPINIT_FAIL", false};
        if (_httpCallback) _httpCallback(_httpResponse);
        _operation = GsmOperation::NONE;
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpSetSsl() {
    if (rxContains("OK")) {
        sendCmd("AT+HTTPSSL=1");
        transitionTo(GsmState::HTTP_SET_URL, GSM_CMD_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        // SSL set failed, try anyway
        sendCmd("AT+HTTPSSL=1");
        transitionTo(GsmState::HTTP_SET_URL, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpSetUrl() {
    if (rxContains("OK")) {
#if API_USE_SSL
        String cmd = "AT+HTTPPARA=\"URL\",\"https://";
#else
        String cmd = "AT+HTTPPARA=\"URL\",\"http://";
#endif
        cmd += API_HOST;
        if (API_PORT != 80 && API_PORT != 443) {
            cmd += ":";
            cmd += String(API_PORT);
        }
        cmd += _pendingUrl;
        cmd += "\"";
        sendCmd(cmd);
        transitionTo(GsmState::HTTP_SET_CONTENT, GSM_CMD_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpSetContent() {
    if (rxContains("OK")) {
        sendCmd("AT+HTTPPARA=\"CONTENT\",\"application/json\"");
        transitionTo(GsmState::HTTP_SET_USERDATA, GSM_CMD_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpSetUserData() {
    if (rxContains("OK")) {
        // Set custom header with API key
        String cmd = "AT+HTTPPARA=\"USERDATA\",\"X-API-Key: ";
        cmd += API_SECRET_KEY;
        cmd += "\\r\\nX-Device-ID: ";
        cmd += DEVICE_ID;
        cmd += "\"";
        sendCmd(cmd);
        // Move to data phase or action directly
        if (_isPostRequest && _pendingBody.length() > 0) {
            transitionTo(GsmState::HTTP_SEND_DATA, GSM_CMD_TIMEOUT_MS);
        } else {
            transitionTo(GsmState::HTTP_ACTION, GSM_CMD_TIMEOUT_MS);
        }
    } else if (rxContains("ERROR") || timedOut()) {
        // Header setting optional - continue
        if (_isPostRequest && _pendingBody.length() > 0) {
            clearRx();
            transitionTo(GsmState::HTTP_SEND_DATA, GSM_CMD_TIMEOUT_MS);
        } else {
            clearRx();
            transitionTo(GsmState::HTTP_ACTION, GSM_CMD_TIMEOUT_MS);
        }
    }
}

void GSMManager::handleHttpSendData() {
    if (_rxBuf.length() == 0) {
        _httpDataLen = _pendingBody.length();
        String cmd   = "AT+HTTPDATA=";
        cmd += String(_httpDataLen);
        cmd += ",10000";
        sendCmd(cmd);
        return;
    }
    // SIM800L responds with "DOWNLOAD" prompt
    if (rxContains("DOWNLOAD")) {
        // Send raw body immediately (no println - we send exact bytes)
        _serial.print(_pendingBody);
        LOGF("GSM", "HTTP body sent (%d bytes)", _httpDataLen);
        transitionTo(GsmState::HTTP_DATA_WAIT, GSM_CMD_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpDataWait() {
    if (rxContains("OK")) {
        transitionTo(GsmState::HTTP_ACTION, GSM_CMD_TIMEOUT_MS);
    } else if (rxContains("ERROR") || timedOut()) {
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpAction() {
    if (_rxBuf.length() == 0) {
        // 1 = POST, 0 = GET
        String cmd = "AT+HTTPACTION=";
        cmd += String(_isPostRequest ? 1 : 0);
        sendCmd(cmd);
        transitionTo(GsmState::HTTP_ACTION_WAIT, API_TIMEOUT_MS);
        return;
    }
}

void GSMManager::handleHttpActionWait() {
    // Response: +HTTPACTION: 1,200,128  (method, status, bytes)
    if (rxContains("+HTTPACTION:")) {
        int idx = _rxBuf.indexOf("+HTTPACTION:");
        String part = _rxBuf.substring(idx + 13);  // skip "+HTTPACTION: "
        // Parse: method,statusCode,length
        int c1 = part.indexOf(',');
        int c2 = part.indexOf(',', c1 + 1);
        if (c1 > 0 && c2 > c1) {
            _httpResponse.statusCode = part.substring(c1 + 1, c2).toInt();
            _httpResponse.success = (_httpResponse.statusCode >= 200 &&
                                      _httpResponse.statusCode < 300);
            LOGF("GSM", "HTTP response: %d", _httpResponse.statusCode);
        }
        transitionTo(GsmState::HTTP_READ, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        LOG("GSM", "HTTP action timeout");
        _httpResponse = {0, "TIMEOUT", false};
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpRead() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+HTTPREAD");
        return;
    }
    // +HTTPREAD: <len>\r\n<data>
    if (rxContains("+HTTPREAD:")) {
        int idx  = _rxBuf.indexOf("+HTTPREAD:");
        int nl   = _rxBuf.indexOf('\n', idx);
        if (nl != -1) {
            // Everything after the newline is the body
            _httpResponse.body = _rxBuf.substring(nl + 1);
            _httpResponse.body.trim();
            LOGF("GSM", "HTTP body: %s", _httpResponse.body.c_str());
        }
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    } else if (timedOut()) {
        transitionTo(GsmState::HTTP_TERM, GSM_CMD_TIMEOUT_MS);
    }
}

void GSMManager::handleHttpTerm() {
    if (_rxBuf.length() == 0) {
        sendCmd("AT+HTTPTERM");
        return;
    }
    if (rxContains("OK") || rxContains("ERROR") || timedOut()) {
        // Fire callback
        if (_httpCallback && (_operation == GsmOperation::HTTP_POST ||
                               _operation == GsmOperation::HTTP_GET)) {
            _httpCallback(_httpResponse);
        }
        _operation    = GsmOperation::NONE;
        _httpCallback = nullptr;
        _bearerOpen   = true;  // Bearer stays open after HTTP
        transitionTo(GsmState::READY, 0);
    }
}

// ============================================================
// SMS State Handlers
// ============================================================

void GSMManager::handleSmsSend() {
    switch (_state) {
        case GsmState::SMS_SET_MODE:
            sendCmd("AT+CMGF=1");
            transitionTo(GsmState::SMS_SET_RECIP, GSM_CMD_TIMEOUT_MS);
            break;

        case GsmState::SMS_SET_RECIP:
            if (rxContains("OK")) {
                String cmd = "AT+CMGS=\"";
                cmd += _pendingPhone;
                cmd += "\"";
                sendCmd(cmd);
                transitionTo(GsmState::SMS_WAIT_PROMPT, GSM_CMD_TIMEOUT_MS);
            } else if (timedOut()) {
                transitionTo(GsmState::ERROR, 0);
            }
            break;

        case GsmState::SMS_WAIT_PROMPT:
            if (rxContains(">")) {
                // Send text body followed by Ctrl-Z (0x1A)
                _serial.print(_pendingSmsTxt);
                _serial.write(0x1A);
                LOGF("GSM", "SMS body sent to %s", _pendingPhone.c_str());
                transitionTo(GsmState::SMS_SEND_BODY, 15000);
            } else if (timedOut()) {
                transitionTo(GsmState::ERROR, 0);
            }
            break;

        case GsmState::SMS_SEND_BODY:
            if (rxContains("+CMGS:") || rxContains("OK")) {
                LOG("GSM", "SMS sent successfully");
                _operation = GsmOperation::NONE;
                transitionTo(GsmState::READY, 0);
            } else if (rxContains("ERROR") || timedOut()) {
                LOG("GSM", "SMS send failed");
                _operation = GsmOperation::NONE;
                transitionTo(GsmState::READY, 0);
            }
            break;

        default: break;
    }
}

// ============================================================
// Error Handler
// ============================================================

void GSMManager::handleError() {
    LOG("GSM", "ERROR state - will reinit in 10s");
    _networkReady = false;
    _gprsReady    = false;
    _bearerOpen   = false;
    if (timedOut()) {
        _retryCount = 0;
        hardReset();
    }
}

// ============================================================
// Debug Utility
// ============================================================

const char* GSMManager::getStateName() const {
    switch (_state) {
        case GsmState::OFF:              return "OFF";
        case GsmState::POWERING_ON:      return "POWERING_ON";
        case GsmState::WAIT_READY:       return "WAIT_READY";
        case GsmState::SEND_AT:          return "SEND_AT";
        case GsmState::DISABLE_ECHO:     return "DISABLE_ECHO";
        case GsmState::SET_SMS_MODE:     return "SET_SMS_MODE";
        case GsmState::CHECK_SIM:        return "CHECK_SIM";
        case GsmState::WAIT_NETWORK:     return "WAIT_NETWORK";
        case GsmState::GET_SIGNAL:       return "GET_SIGNAL";
        case GsmState::GPRS_ATTACH:      return "GPRS_ATTACH";
        case GsmState::BEARER_SET_CONTYPE: return "BEARER_CONTYPE";
        case GsmState::BEARER_SET_APN:   return "BEARER_APN";
        case GsmState::BEARER_OPEN:      return "BEARER_OPEN";
        case GsmState::BEARER_WAIT:      return "BEARER_WAIT";
        case GsmState::READY:            return "READY";
        case GsmState::HTTP_INIT:        return "HTTP_INIT";
        case GsmState::HTTP_ACTION_WAIT: return "HTTP_ACTION_WAIT";
        case GsmState::HTTP_TERM:        return "HTTP_TERM";
        case GsmState::SMS_WAIT_PROMPT:  return "SMS_WAIT_PROMPT";
        case GsmState::ERROR:            return "ERROR";
        default:                         return "UNKNOWN";
    }
}
