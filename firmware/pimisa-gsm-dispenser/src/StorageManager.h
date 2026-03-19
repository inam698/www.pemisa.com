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
#include <Preferences.h>
#include "Config.h"

struct OfflineTransaction {
    char          transactionId[40];
    char          voucherCode[20];
    char          deviceId[30];
    char          type[16];       // "voucher" or "purchase"
    char          phone[20];
    float         volumeMl;
    float         litresDispensed;
    float         amount;
    unsigned long timestamp;
    int           retryCount;
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

    // Peek and remove front entry into out (call after successful send)
    bool dequeue(OfflineTransaction& out);

    // Remove front entry without reading it
    bool dequeue();

    // Alias for dequeue() — remove front entry
    bool remove() { return dequeue(); }

    // Number of pending transactions
    int  size() const;

    // Alias for size()
    int  getCount() const { return size(); }

    // True if queue is empty
    bool isEmpty() const { return size() == 0; }

    // True if queue is full (at MAX_OFFLINE_QUEUE)
    bool isFull() const { return size() >= MAX_OFFLINE_QUEUE; }

    // Clear entire queue
    void clear();

    // Dump queue to serial (debug)
    void dump();

    // Price per litre (persisted in NVS)
    float loadPricePerLitre();
    void  savePricePerLitre(float price);

    // Lifetime stats (persisted in NVS)
    void loadLifetimeStats(float& totalLitres, uint32_t& totalCycles);
    void saveLifetimeStats(float totalLitres, uint32_t totalCycles);

private:
    int _size;  // Cached count

    // Parse a single JSON line into OfflineTransaction
    bool parseLine(const String& line, OfflineTransaction& out);

    // Serialize a transaction to JSON line
    String serialize(const OfflineTransaction& txn);

    // Recount queue from file
    void recount();
};
