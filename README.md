# PIMISA - IoT Cooking Oil Dispenser System

> **Full-stack IoT platform**: ESP32 firmware + cloud dashboard for automated cooking oil vending across Zambia. Supports 1000+ dispensers with offline-first architecture.

[![Live Demo](https://img.shields.io/badge/Live-pimisa--voucher--system.vercel.app-brightgreen)](https://pimisa-voucher-system.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-inam698-blue)](https://github.com/inam698/www.pemisa.com)
[![Firmware](https://img.shields.io/badge/ESP32-Arduino_Firmware-orange)]()
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## The Problem

In rural Zambia, cooking oil distribution to vulnerable communities relies on paper vouchers — prone to fraud, duplication, and impossible to track. Stations have unreliable internet, frequent power outages, and no way to verify vouchers in real-time.

## The Solution

**PIMISA** is an end-to-end IoT oil dispensing platform that combines:

1. **ESP32-powered dispensers** with flow sensors, keypads, and LCD displays
2. **Cloud-based admin dashboard** for fleet management, voucher distribution, and real-time monitoring
3. **Offline-first architecture** — dispensers keep working without internet and sync when connectivity returns

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

### ESP32 Firmware (Arduino C++)

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
| **Microcontroller** | ESP32 Dev Module (Dual-core 240MHz, WiFi, 4MB Flash) |
| **Firmware** | Arduino C++, ArduinoJson v7, ESP32 NVS, mbedTLS |
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

## Hardware Wiring Diagram

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

### Admin API (Dashboard)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | User login |
| GET | `/api/admin/dashboard` | Admin | Dashboard metrics |
| GET/POST | `/api/admin/machines` | Admin | Machine CRUD + registration |
| GET/POST | `/api/admin/locations` | Admin | Location/fleet management |
| GET/POST | `/api/admin/pricing` | Admin | Dynamic pricing rules |
| POST | `/api/admin/upload-csv` | Admin | Bulk CSV voucher import |
| GET | `/api/admin/vouchers` | Admin | Paginated voucher list |

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL (or Docker)
- ESP32 Dev Module + Arduino IDE (for firmware)

### Web Dashboard

```bash
cd pimisa-voucher-system
npm install
cp .env.example .env       # Edit with your DB URL
npx prisma migrate dev
npx prisma db seed
npm run dev                 # http://localhost:3000
```

### ESP32 Firmware

1. Install Arduino IDE libraries: **ArduinoJson** (v7+), **LiquidCrystal_I2C**, **Keypad**
2. Select board: **ESP32 Dev Module**
3. Register machine in Admin Dashboard → copy Device ID + API Key
4. Edit `firmware/config.h` with your WiFi + credentials
5. Flash via USB → device auto-connects to cloud

---

## Project Structure

```
pimisa-voucher-system/
├── firmware/                           # ESP32 Arduino firmware
│   ├── config.h                        #   Device config, pins, credentials
│   ├── main_pimisa_dispenser.ino       #   Main sketch (state machine)
│   ├── wifi_manager.h/.cpp             #   WiFi auto-reconnect
│   ├── api_client.h/.cpp               #   HTTPS client + retries
│   ├── voucher_service.h/.cpp          #   Online/offline voucher verification
│   ├── offline_voucher_cache.h/.cpp    #   NVS voucher cache
│   ├── sales_reporting.h/.cpp          #   Sales reporting + offline queue
│   ├── heartbeat_service.h/.cpp        #   Adaptive heartbeat + telemetry
│   ├── nvs_storage.h/.cpp              #   Persistent flash storage
│   └── ota_manager.h/.cpp              #   Remote firmware updates
├── src/
│   ├── app/
│   │   ├── admin/                      # Admin dashboard pages
│   │   │   ├── fleet/                  #   Fleet management
│   │   │   ├── machines/               #   Machine monitoring
│   │   │   ├── vouchers/               #   Voucher management
│   │   │   └── upload/                 #   CSV bulk import
│   │   ├── station/                    # Station operator portal
│   │   └── api/                        # REST API routes
│   ├── services/                       # Business logic (20 services)
│   ├── lib/                            # Auth, DB, security, utilities
│   └── components/                     # React UI components
├── prisma/
│   ├── schema.prisma                   # 13-table database schema
│   └── migrations/                     # Version-controlled migrations
├── docker-compose.yml                  # Docker deployment
└── package.json
```

---

## Security

| Layer | Protection |
|-------|-----------|
| **Device Auth** | Unique API key per machine + Device ID header |
| **SSL/TLS** | Certificate-pinned HTTPS (ISRG Root X1) |
| **OTA Integrity** | SHA-256 checksum verification before flashing |
| **Web Auth** | Firebase Admin SDK with role-based access control |
| **Rate Limiting** | Per-endpoint limits (login: 10/15min, API: 100/15min) |
| **Input Validation** | Zod schemas on all API endpoints |
| **SQL Injection** | Prisma ORM parameterized queries |
| **Double-Spend** | Atomic database transactions for voucher redemption |
| **Watchdog** | Hardware timer auto-resets hung firmware (60s) |
| **Safety Caps** | Max 50L per transaction, 5-min pump timeout, no-flow detection |

---

## Scalability Design

- **1000+ dispensers** supported via adaptive heartbeat (server controls interval)
- At 30s heartbeat × 1000 devices = ~33 requests/sec — well within Vercel limits
- Offline queues prevent server overload during connectivity restoration
- NVS persistence means zero data loss even during extended outages
- OTA firmware updates can be pushed fleet-wide from the admin dashboard

---

## Live Deployment

- **Dashboard**: [pimisa-voucher-system.vercel.app](https://pimisa-voucher-system.vercel.app)
- **Database**: Neon PostgreSQL (serverless, auto-scaling)
- **CI/CD**: Auto-deploy on push to `main` via Vercel + GitHub integration
- **GitHub**: [github.com/inam698/www.pemisa.com](https://github.com/inam698/www.pemisa.com)

---

## Built With

- **ESP32** — Espressif dual-core microcontroller
- **Arduino Framework** — C++ firmware development
- **Next.js 15** — React framework with App Router
- **TypeScript** — Type-safe frontend and backend
- **Prisma ORM** — Database toolkit with type-safe queries
- **PostgreSQL** — Relational database
- **Firebase** — Authentication
- **Tailwind CSS** — Utility-first styling
- **Vercel** — Edge deployment platform

---

## License

Proprietary — Pimisa Enterprises Limited
