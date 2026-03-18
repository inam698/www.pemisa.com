// ============================================================
// PIMISA IoT Cooking Oil Dispenser
// StorageManager.h - Offline Transaction Queue (SPIFFS)
//
// When GSM/GPRS is unavailable, completed transactions are
// queued as JSON lines in SPIFFS. The queue is replayed
// when connectivity is restored.
//
// Queue format (OFFLINE_QUEUE_FILE = /queue.json):
//   One JSON object per line:
//   {"id":"TXN-xxx","code":"PIMISA-001","vol":500.0,"ts":1234567}
//   {"id":"TXN-yyy","code":"PIMISA-002","vol":250.0,"ts":1234568}
//
// Design:
//   - Append-only writes (O(1) per enqueue)
//   - Full file rewrite on dequeue (acceptable for small queues)
//   - MAX_OFFLINE_QUEUE entries cap prevents storage overflow
// ============================================================
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>
#include "Config.h"

struct OfflineTransaction {
    String        transactionId;
    String        voucherCode;
    float         volumeMl;
    unsigned long timestamp;
    String        deviceId;
};

class StorageManager {
public:
    StorageManager();

    // Call once in setup()
    bool begin();

    // Add a transaction to the offline queue
    // Returns false if queue is full
    bool enqueue(const OfflineTransaction& txn);

    // Peek at the front of the queue without removing
    // Returns false if queue is empty
    bool peek(OfflineTransaction& out);

    // Remove the front entry (call after successful send)
    bool dequeue();

    // Number of pending transactions
    int  size() const;

    // True if queue is empty
    bool isEmpty() const { return size() == 0; }

    // True if queue is full (at MAX_OFFLINE_QUEUE)
    bool isFull() const { return size() >= MAX_OFFLINE_QUEUE; }

    // Clear entire queue
    void clear();

    // Dump queue to serial (debug)
    void dump();

private:
    int _size;  // Cached count

    // Parse a single JSON line into OfflineTransaction
    bool parseLine(const String& line, OfflineTransaction& out);

    // Serialize a transaction to JSON line
    String serialize(const OfflineTransaction& txn);

    // Recount queue from file
    void recount();
};
