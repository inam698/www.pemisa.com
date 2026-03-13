# PIMISA - IoT Cooking Oil Dispenser System

### Master of Arduino 2.0 Contest Entry

> **Full-stack Arduino IoT platform**: Arduino-powered ESP32 firmware + cloud dashboard for automated cooking oil vending across rural Zambia. Offline-first design keeps dispensers running through connectivity and power disruptions.

[![Live Demo](https://img.shields.io/badge/Live-pimisa--voucher--system.vercel.app-brightgreen)](https://pimisa-voucher-system.vercel.app)
[![Arduino](https://img.shields.io/badge/Arduino-Framework%20%2B%20IDE-00979D?logo=arduino&logoColor=white)]()
[![GitHub](https://img.shields.io/badge/GitHub-inam698-blue)](https://github.com/inam698/www.pemisa.com)
[![Firmware](https://img.shields.io/badge/ESP32-Arduino_C++-orange)]()

---

## Arduino Component (Contest Requirement)

**Arduino is the foundation of this entire IoT system.** Every dispenser runs firmware built in the Arduino ecosystem:

### Arduino Framework & IDE

Firmware is written in **Arduino C++** using the standard sketch paradigm:

- **`setup()`** — Init hardware, WiFi, services
- **`loop()`** — State machine, sensors, heartbeats
- **`.ino` sketch** — Entry point: `main_pimisa_dispenser.ino`
- **Board Manager** — ESP32 core via Arduino Board Manager

### Arduino Libraries Used

| Arduino Library | Purpose in PIMISA |
|----------------|-------------------|
| **Wire.h** | I2C communication bus for the 16×2 LCD display |
| **LiquidCrystal_I2C** | Character LCD driver — displays menus, flow progress, status messages |
| **Keypad** (Mark Stanley & Alexander Brevig) | 4×4 matrix keypad scanning — user input for voucher codes, amounts |
| **ArduinoJson** v7 (Benoît Blanchon) | JSON serialization/deserialization for all cloud API communication |
| **WiFi.h** (Arduino ESP32 Core) | WiFi station mode with auto-reconnect and network scanning |
| **HTTPClient.h** (Arduino ESP32 Core) | HTTP/HTTPS client for REST API calls to cloud server |
| **WiFiClientSecure.h** (Arduino ESP32 Core) | TLS/SSL encrypted connections with certificate pinning |
| **Update.h** (Arduino ESP32 Core) | Over-The-Air (OTA) firmware updates — remote fleet-wide deployment |
| **Preferences.h** (Arduino ESP32 Core) | Non-Volatile Storage (NVS) wrapper — offline data persists across power outages |

### Arduino-Compatible Hardware

The firmware is designed for **Arduino-compatible ESP32 boards**:

- **ESP32 Dev Module** (primary development board)
- **Arduino Nano ESP32** (official Arduino product — ABX00083 — drop-in compatible)
- **Arduino Nano ESP32-S3** (official Arduino product — fully supported)
- Any ESP32 board supported by the Arduino Board Manager

For contest submission, include photos showing an official Arduino board (e.g., Nano ESP32 ABX00083).

### Why Arduino?

1. **Accessibility** — Arduino IDE lowers the barrier for technicians in Zambia to maintain and modify firmware
2. **Library ecosystem** — ArduinoJson, Keypad, LiquidCrystal_I2C are widely used
3. **Portability** — Same sketch runs on generic ESP32 dev boards AND official Arduino Nano ESP32 hardware

---

## The Problem

In rural Zambia, cooking oil distribution to vulnerable communities relies on paper vouchers — prone to fraud, duplication, and impossible to track. Stations have unreliable internet, frequent power outages, and no way to verify vouchers in real-time.

## The Solution

**PIMISA** is an end-to-end Arduino IoT oil dispensing platform that combines:

1. **Arduino-powered ESP32 dispensers** with flow sensors, keypads, and LCD displays
2. **Cloud-based admin dashboard** for fleet management, voucher distribution, and real-time monitoring
3. **Offline-first architecture** — dispensers keep working without internet and sync when connectivity returns

## Socioeconomic Impact

In many rural Zambian communities, cooking oil distribution still relies on paper vouchers, which are easy to duplicate and difficult to audit. PIMISA replaces paper with secure digital vouchers and automated volumetric dispensing, ensuring each beneficiary receives the correct allocation.

By recording every dispense event and syncing to the dashboard (online or later), stakeholders gain transparency and better inventory planning.

---

## System Architecture

```
                         ┌─────────────────────────────────────────┐
                         │          PIMISA CLOUD (Vercel)          │
                         │                                         │
                         │  ┌─────────┐  ┌──────────┐  ┌───────┐  │
                         │  │ Admin   │  │ Station  │  │ API   │  │
                         │  │ Portal  │  │ Portal   │  │Routes │  │
                         │  └────┬────┘  └────┬─────┘  └───┬───┘  │
                         │       │            │            │       │
                         │  ┌────┴────────────┴────────────┴───┐  │
                         │  │     Next.js 15 + Prisma ORM      │  │
                         │  └──────────────┬───────────────────┘  │
                         │                 │                       │
                         │  ┌──────────────┴───────────────────┐  │
                         │  │    PostgreSQL (Neon Serverless)   │  │
                         │  └──────────────────────────────────┘  │
                         └──────────────────┬──────────────────────┘
                                            │ HTTPS + API Keys
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
          ┌─────────┴─────────┐   ┌─────────┴─────────┐   ┌────────┴────────┐
          │   ESP32 #1        │   │   ESP32 #2        │   │   ESP32 #N      │
          │   ┌───────────┐   │   │   ┌───────────┐   │   │   ┌──────────┐  │
          │   │ Flow      │   │   │   │ Flow      │   │   │   │ Flow     │  │
          │   │ Sensor    │   │   │   │ Sensor    │   │   │   │ Sensor   │  │
          │   ├───────────┤   │   │   ├───────────┤   │   │   ├──────────┤  │
          │   │ 4x4       │   │   │   │ 4x4       │   │   │   │ 4x4      │  │
          │   │ Keypad    │   │   │   │ Keypad    │   │   │   │ Keypad   │  │
          │   ├───────────┤   │   │   ├───────────┤   │   │   ├──────────┤  │
          │   │ 16x2 LCD  │   │   │   │ 16x2 LCD  │   │   │   │ 16x2 LCD│  │
          │   ├───────────┤   │   │   ├───────────┤   │   │   ├──────────┤  │
          │   │ Oil Pump  │   │   │   │ Oil Pump  │   │   │   │ Oil Pump │  │
          │   │ + Relay   │   │   │   │ + Relay   │   │   │   │ + Relay  │  │
          │   ├───────────┤   │   │   ├───────────┤   │   │   ├──────────┤  │
          │   │ NVS Flash │   │   │   │ NVS Flash │   │   │   │ NVS Flash│  │
          │   │ (Offline) │   │   │   │ (Offline) │   │   │   │(Offline) │  │
          │   └───────────┘   │   │   └───────────┘   │   │   └──────────┘  │
          └───────────────────┘   └───────────────────┘   └─────────────────┘
                Station A                Station B              Station N
```

---

## Key Features

### Arduino ESP32 Firmware (C++)

| Feature | Description |
|---------|-------------|
| **3 Dispensing Modes** | Voucher code, cash payment, buy-by-litres |
| **Offline Voucher Cache** | 50 vouchers cached in NVS flash with 24h TTL — works without internet |
| **Offline Sales Queue** | 100 transactions in NVS + 50 in RAM — survives power outages |
| **Adaptive Heartbeat** | Server-controlled interval (10s–5min) — scales to 1000+ devices |
| **OTA Firmware Updates** | Remote firmware push with SHA-256 checksum verification |
| **Flow Sensor Calibration** | Configurable pulses-per-litre for AICHI or YF-S201 sensors |
| **Hardware Watchdog** | Auto-reset if firmware hangs (60s timeout) |
| **SSL/TLS Encryption** | Certificate-pinned HTTPS with Let's Encrypt ISRG Root X1 |
| **Safety Systems** | Max dispense cap, max pump runtime, no-flow detection |
| **Telemetry** | Oil level, temperature, RSSI, uptime, pump cycles |

### Web Dashboard (Next.js + TypeScript)

| Feature | Description |
|---------|-------------|
| **Multi-Tenant Admin** | Role-based access: super-admin, admin, station operator |
| **Fleet Management** | Locations, machine assignment, dynamic pricing rules |
| **Voucher System** | Bulk CSV import, individual creation, beneficiary tracking |
| **Real-Time Monitoring** | Machine heartbeats, online/offline status, oil levels |
| **Sales & Transactions** | Full audit trail, export capabilities, reporting |
| **Device Registration** | Generate unique Device ID + API Key per machine |
| **Firebase Auth** | Secure authentication with session management |
| **SMS/WhatsApp** | Voucher delivery via Africa's Talking |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Arduino Framework** | Arduino IDE / PlatformIO — core development environment |
| **Arduino Libraries** | Wire, LiquidCrystal_I2C, Keypad, ArduinoJson v7, WiFi, HTTPClient, Update, Preferences |
| **Microcontroller** | ESP32 Dev Module / Arduino Nano ESP32 (Dual-core 240MHz, WiFi, 4MB Flash) |
| **Firmware** | Arduino C++ (~2,500 lines), 12 source files, modular .h/.cpp architecture |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, ShadCN UI |
| **Backend** | Next.js API Routes, Prisma ORM v6, REST architecture |
| **Database** | PostgreSQL (Neon Serverless) |
| **Auth** | Firebase Admin SDK, role-based middleware |
| **Deployment** | Vercel (auto-deploy from GitHub) |
| **SMS** | Africa's Talking API |
| **Hardware** | Flow sensor, 12V pump + relay, 4x4 keypad, I2C LCD, NTC thermistor |

---

## Offline-First Design (Key Innovation)

The biggest challenge in rural Zambia: **internet goes down, power goes out, but people still need oil.**

```
ONLINE MODE                              OFFLINE MODE
───────────                              ────────────
Customer enters voucher code             Customer enters voucher code
        │                                        │
        ▼                                        ▼
ESP32 sends to cloud server              ESP32 checks NVS flash cache
        │                                        │
        ▼                                        ▼
Server verifies + responds               Found? → Dispense oil
        │                                        │
        ▼                                        ▼
Cache voucher locally (NVS)              Queue redemption in NVS flash
        │                                        │
        ▼                                        ▼
Dispense oil                             ┌─── Power outage? ───┐
        │                                │   NVS survives      │
        ▼                                │   reboot/power loss  │
Report sale to server                    └──────────┬──────────┘
                                                    │
                                         When internet returns:
                                         Auto-sync all queued
                                         transactions to cloud
```

**Storage Architecture:**
- **RAM Queue**: 50 sales (fast, lost on reboot)
- **NVS Flash Queue**: 100 sales (persistent, survives power outages)
- **Voucher Cache**: 50 vouchers, 24-hour TTL (offline verification)

---

## Hardware Wiring & Components

**Core Components (Bill of Materials):**
* **Microcontroller**: Arduino Nano ESP32 (ABX00083) or ESP32 Dev Module
* **Display**: 16x2 I2C Character LCD
* **Input**: 4x4 Matrix Membrane Keypad
* **Dispensing**: 12V Submersible DC Oil Pump + 5V/12V Relay Module
* **Sensors**: YF-S201 Hall Effect Flow Sensor, NTC Thermistor (temp), Analog Float Sensor (oil level)

```
ESP32 Dev Module
┌────────────────────────────────┐
│                                │
│  GPIO 4  ──── Flow Sensor     │  (interrupt-driven pulse counting)
│  GPIO 23 ──── Relay Module    │  (12V oil pump control)
│  GPIO 34 ──── Oil Level       │  (analog — tank level sensor)
│  GPIO 35 ──── Temperature     │  (analog — NTC thermistor)
│                                │
│  GPIO 27 ┐                    │
│  GPIO 14 ├── 4×4 Keypad      │  (matrix scan — user input)
│  GPIO 12 ├── (Rows)          │
│  GPIO 13 ┘                    │
│  GPIO 32 ┐                    │
│  GPIO 35 ├── 4×4 Keypad      │
│  GPIO 25 ├── (Columns)       │
│  GPIO 26 ┘                    │
│                                │
│  GPIO 21 ──── LCD SDA (I2C)  │  (16×2 character display)
│  GPIO 22 ──── LCD SCL (I2C)  │
│                                │
└────────────────────────────────┘
```

---

## Hardware Engineering Challenges Overcome

Rural deployments introduce constraints that the Arduino-based design addresses:

- **Power instability:** 12V ecosystem (battery/solar-ready) with regulated logic supply; NVS persists critical state across outages.
- **Accurate flow metering:** `attachInterrupt()` + ISR pulse counting (`IRAM_ATTR`) keeps accuracy under load.
- **Flash endurance:** Bounded/circular offline queues reduce unnecessary writes while preserving integrity.

---

## Firmware Modules

```
firmware/
├── config.h                    # WiFi, server, device credentials, pin mapping
├── main_pimisa_dispenser.ino   # Main sketch — state machine, UI, pump control
├── wifi_manager.h/.cpp         # Auto-reconnect with exponential backoff
├── api_client.h/.cpp           # HTTPS client with retries & SSL cert pinning
├── voucher_service.h/.cpp      # Verify/redeem — online + offline cache fallback
├── offline_voucher_cache.h/.cpp# NVS-backed voucher cache (50 entries, 24h TTL)
├── sales_reporting.h/.cpp      # Cash/voucher sales with offline circular queue
├── heartbeat_service.h/.cpp    # Adaptive heartbeat with sensor telemetry
├── nvs_storage.h/.cpp          # Persistent storage — survives power loss
└── ota_manager.h/.cpp          # Remote firmware updates with SHA-256 verification
```

**12 source files | ~2,500 lines of C++ | Modular architecture**

---

## Dispenser State Machine

```
                    ┌──────────────┐
                    │              │
                    │   IDLE       │◄──────────────────────────────┐
                    │  "PIMISA"    │                               │
                    │  "#=Go"      │                               │
                    └──────┬───────┘                               │
                           │ #                                     │
                    ┌──────▼───────┐                               │
                    │ SELECT MODE  │                               │
                    │ A=Voucher    │                               │
                    │ B=Cash       │                               │
                    │ C=Buy Litres │                               │
                    └──┬───┬───┬───┘                               │
                       │   │   │                                   │
              ┌────────┘   │   └──────────┐                       │
              ▼            ▼              ▼                        │
        ┌──────────┐ ┌──────────┐ ┌──────────────┐               │
        │ VOUCHER  │ │  CASH    │ │ BUY LITRES   │               │
        │  PHONE   │ │ AMOUNT   │ │ Enter volume │               │
        └────┬─────┘ └────┬─────┘ └──────┬───────┘               │
             │             │              │                        │
        ┌────▼─────┐       │              │                        │
        │ VOUCHER  │       │              │                        │
        │  CODE    │       │              │                        │
        └────┬─────┘       │              │                        │
             │             │              │                        │
        ┌────▼─────┐       │              │                        │
        │ VERIFY   │       │              │                        │
        │(online/  │       │              │                        │
        │ offline) │       │              │                        │
        └────┬─────┘       │              │                        │
             │             │              │                        │
             └──────┬──────┴──────────────┘                       │
                    ▼                                              │
             ┌──────────────┐                                     │
             │  DISPENSING   │   Real-time flow counting          │
             │  "2.45L/5.0L" │   LCD updates at 4 FPS             │
             └──────┬───────┘   *=Emergency stop                  │
                    │                                              │
             ┌──────▼───────┐                                     │
             │  COMPLETE     │   Report sale → server/queue       │
             │  "Done! 5.0L" │   Log transaction + update NVS     │
             └──────┬───────┘                                     │
                    │ 10s timeout or #                             │
                    └─────────────────────────────────────────────┘
```

---

## API Endpoints

### Device API (ESP32 → Cloud)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/device/heartbeat` | API Key | Machine health check + telemetry |
| POST | `/api/device/transaction` | API Key | Log dispensing transaction |
| POST | `/api/voucher/verify` | API Key | Verify voucher code |
| POST | `/api/voucher/redeem` | API Key | Confirm voucher redemption |
| POST | `/api/sales/report` | API Key | Report cash/voucher sale |

The admin dashboard exposes REST endpoints for fleet management, vouchers, pricing, monitoring, and device registration — protected by Firebase Auth + roles.

---

## Security & Scalability

| Layer | Protection |
|-------|-----------|
| **Device Auth** | Unique API key per machine + Device ID header |
| **SSL/TLS** | Certificate-pinned HTTPS (ISRG Root X1) |
| **OTA Integrity** | SHA-256 checksum verification before flashing |
| **Web Auth** | Firebase Admin SDK with role-based access control |
| **Double-Spend** | Atomic database transactions for voucher redemption |
| **Safety Caps** | Max 50L per transaction, 5-min pump timeout, no-flow detection |

**1000+ dispensers** supported via adaptive heartbeat; offline queues + OTA keep fleets resilient.

---

## Live Deployment

- **Dashboard**: [pimisa-voucher-system.vercel.app](https://pimisa-voucher-system.vercel.app)
- **Database**: Neon PostgreSQL (serverless, auto-scaling)
- **CI/CD**: Auto-deploy on push to `main` via Vercel + GitHub integration
- **GitHub**: [github.com/inam698/www.pemisa.com](https://github.com/inam698/www.pemisa.com)

---

## Contest: Master of Arduino 2.0 — Judging Criteria

| Criterion | How PIMISA Meets It |
|-----------|--------------------|
| **a) Creativity** | Arduino IoT hardware + cloud dashboard solving cooking oil fraud in rural Zambia — no existing product addresses this. |
| **b) Precision & Neatness** | Modular firmware (12 files, ~2,500 lines), wiring diagram, state machine diagram, full API docs, clean PCB-ready pin mapping. |
| **c) Innovativeness** | Offline-first: NVS flash caches vouchers and queues sales across power outages. Adaptive heartbeat scales to 1000+ devices. OTA deploys firmware remotely. |
| **d) Arduino Component** | Built on **Arduino Framework** (IDE + ESP32 Core). Uses 9 Arduino libraries. Compatible with **Arduino Nano ESP32** (ABX00083) — official Arduino hardware. `.ino` sketch, `setup()`/`loop()`, and Board Manager are the foundation. |

**Arduino enables impact at scale**: one sketch, one framework, deployed across many dispensers.

## Submission Evidence (Photos + Video)

- **Photos**: Arduino board visible (e.g., Nano ESP32 ABX00083) + wiring.
- **Video (≤3 min)**: voucher entry → verify (online/offline) → dispense → dashboard log.

---

## Alignment with United Nations Sustainable Development Goals (SDGs)

The PIMISA IoT Cooking Oil Dispenser System contributes to United Nations Sustainable Development Goals by improving distribution transparency and reducing waste.

**SDG 2 – Zero Hunger**

The system supports food security by ensuring fair and accurate distribution of cooking oil. Automated dispensing guarantees each beneficiary receives the correct allocated amount, reducing hoarding and inequality.

**SDG 9 – Industry, Innovation and Infrastructure**

PIMISA introduces IoT-based infrastructure for resource distribution by integrating microcontrollers, sensors, pumps, and digital monitoring.

**SDG 12 – Responsible Consumption and Production**

PIMISA promotes responsible resource management by dispensing precise quantities and recording usage data, reducing waste and improving supply-chain transparency.

**SDG 11 – Sustainable Cities and Communities**

PIMISA supports more accountable community supply programs through digital monitoring, improved planning, and clearer audit trails.

## Author

**Emmanuel Inambo** — Zambia  
Contest: Master of Arduino 2.0 (February–May 2026)  
Website: [techmasterevent.com](https://techmasterevent.com)

---

## License

Proprietary — Pimisa Enterprises Limited
