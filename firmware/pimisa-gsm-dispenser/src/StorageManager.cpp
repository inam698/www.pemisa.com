// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// StorageManager.cpp - SPIFFS Offline Queue Implementation
// ============================================================
#include "StorageManager.h"

StorageManager::StorageManager() : _size(0) {}

bool StorageManager::begin() {
    if (!SPIFFS.begin(true)) {   // true = format on fail
        LOG("STOR", "SPIFFS mount failed!");
        return false;
    }
    recount();
    LOGF("STOR", "SPIFFS ready. Queue size: %d", _size);
    return true;
}

// ---- enqueue() ----------------------------------------------
bool StorageManager::enqueue(const OfflineTransaction& txn) {
    if (_size >= MAX_OFFLINE_QUEUE) {
        LOG("STOR", "Queue full - dropping transaction");
        return false;
    }

    File f = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_APPEND);
    if (!f) {
        LOG("STOR", "Failed to open queue file for append");
        return false;
    }

    String line = serialize(txn);
    f.println(line);
    f.close();
    _size++;

    LOGF("STOR", "Enqueued: %s (queue=%d)", txn.voucherCode, _size);
    return true;
}

// ---- peek() -------------------------------------------------
bool StorageManager::peek(OfflineTransaction& out) {
    if (_size == 0) return false;

    File f = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_READ);
    if (!f) return false;

    String line = f.readStringUntil('\n');
    f.close();
    line.trim();

    if (line.length() == 0) {
        recount();
        return false;
    }

    return parseLine(line, out);
}

// ---- dequeue(out) -------------------------------------------
// Peek + remove: reads front entry into out, then removes it
bool StorageManager::dequeue(OfflineTransaction& out) {
    if (!peek(out)) return false;
    return dequeue();
}

// ---- dequeue() ----------------------------------------------
// Removes the first line from the file by rewriting all remaining lines
bool StorageManager::dequeue() {
    if (_size == 0) return false;

    File f = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_READ);
    if (!f) return false;

    // Skip first line (the one we just successfully sent)
    f.readStringUntil('\n');

    // Read remaining lines
    String remaining = f.readString();
    f.close();

    // Rewrite file with remaining content
    File fw = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_WRITE);
    if (!fw) return false;
    fw.print(remaining);
    fw.close();

    _size = max(0, _size - 1);
    LOGF("STOR", "Dequeued. Remaining: %d", _size);
    return true;
}

// ---- size() -------------------------------------------------
int StorageManager::size() const { return _size; }

// ---- clear() ------------------------------------------------
void StorageManager::clear() {
    SPIFFS.remove(OFFLINE_QUEUE_FILE);
    _size = 0;
    LOG("STOR", "Queue cleared");
}

// ---- dump() -------------------------------------------------
void StorageManager::dump() {
    if (!SPIFFS.exists(OFFLINE_QUEUE_FILE)) {
        LOG("STOR", "Queue file does not exist");
        return;
    }
    File f = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_READ);
    if (!f) return;
    LOGF("STOR", "--- Queue dump (%d entries) ---", _size);
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() > 0) LOG("STOR", line.c_str());
    }
    f.close();
}

// ============================================================
// Private
// ============================================================

bool StorageManager::parseLine(const String& line, OfflineTransaction& out) {
    JsonDocument doc;
    if (deserializeJson(doc, line) != DeserializationError::Ok) {
        LOGF("STOR", "Parse error: %s", line.c_str());
        return false;
    }
    memset(&out, 0, sizeof(out));
    strncpy(out.transactionId,  doc["id"]   | "",        sizeof(out.transactionId) - 1);
    strncpy(out.voucherCode,    doc["code"] | "",        sizeof(out.voucherCode) - 1);
    strncpy(out.deviceId,       doc["dev"]  | DEVICE_ID, sizeof(out.deviceId) - 1);
    strncpy(out.type,           doc["type"] | "voucher", sizeof(out.type) - 1);
    strncpy(out.phone,          doc["ph"]   | "",        sizeof(out.phone) - 1);
    out.volumeMl        = doc["vol"]    | 0.0f;
    out.litresDispensed = doc["litres"] | 0.0f;
    out.amount          = doc["amt"]    | 0.0f;
    out.timestamp       = doc["ts"]     | 0UL;
    out.retryCount      = doc["retry"]  | 0;
    return out.voucherCode[0] != '\0';
}

String StorageManager::serialize(const OfflineTransaction& txn) {
    JsonDocument doc;
    doc["id"]    = txn.transactionId;
    doc["code"]  = txn.voucherCode;
    doc["dev"]   = txn.deviceId;
    doc["type"]  = txn.type;
    doc["ph"]    = txn.phone;
    doc["vol"]   = (int)txn.volumeMl;
    doc["litres"] = txn.litresDispensed;
    doc["amt"]   = txn.amount;
    doc["ts"]    = txn.timestamp;
    doc["retry"] = txn.retryCount;
    String out;
    serializeJson(doc, out);
    return out;
}

void StorageManager::recount() {
    _size = 0;
    if (!SPIFFS.exists(OFFLINE_QUEUE_FILE)) return;
    File f = SPIFFS.open(OFFLINE_QUEUE_FILE, FILE_READ);
    if (!f) return;
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() > 2) _size++;   // Ignore blank lines
    }
    f.close();
}

// ---- loadPricePerLitre() ------------------------------------
float StorageManager::loadPricePerLitre() {
    Preferences prefs;
    prefs.begin("pimisa", true);  // read-only
    float price = prefs.getFloat("price_litre", 10.0f);  // default 10.0 ZMW
    prefs.end();
    return price;
}

// ---- savePricePerLitre() ------------------------------------
void StorageManager::savePricePerLitre(float price) {
    Preferences prefs;
    prefs.begin("pimisa", false);
    prefs.putFloat("price_litre", price);
    prefs.end();
}

// ---- loadLifetimeStats() ------------------------------------
void StorageManager::loadLifetimeStats(float& totalLitres, uint32_t& totalCycles) {
    Preferences prefs;
    prefs.begin("pimisa", true);
    totalLitres = prefs.getFloat("total_litres", 0.0f);
    totalCycles = prefs.getUInt("pump_cycles", 0);
    prefs.end();
}

// ---- saveLifetimeStats() ------------------------------------
void StorageManager::saveLifetimeStats(float totalLitres, uint32_t totalCycles) {
    Preferences prefs;
    prefs.begin("pimisa", false);
    prefs.putFloat("total_litres", totalLitres);
    prefs.putUInt("pump_cycles", totalCycles);
    prefs.end();
}
