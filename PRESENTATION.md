# PIMISA VOUCHER SYSTEM
## Project Presentation — March 2026

---

## 1. PROJECT OVERVIEW

**Pimisa** is a multi-tenant SaaS platform for distributing and redeeming cooking oil vouchers via IoT dispensers in Zambia. It connects a cloud-based management system to 1,000+ ESP32-powered oil dispensing machines deployed across multiple stations.

### The Problem
- Manual oil distribution is prone to fraud, theft, and inaccurate record-keeping
- No real-time visibility into stock levels, machine health, or transaction history
- Beneficiaries have no reliable way to verify or redeem vouchers at scale

### The Solution
An end-to-end digital system where:
1. **Admins** generate vouchers and distribute them via SMS
2. **Beneficiaries** enter their voucher code on a physical dispenser
3. The **ESP32 machine** verifies the voucher with the cloud, dispenses the exact amount of oil, and logs everything
4. **Operators** monitor the entire fleet in real-time from a web dashboard

---

## 2. TECHNOLOGY STACK

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, ShadCN UI, Recharts |
| **Backend** | Next.js API Routes, Prisma ORM, PostgreSQL 16 |
| **Caching** | Redis 7 (device auth, rate limiting, fleet status) |
| **Auth** | JWT (devices) + Firebase Admin SDK (users) + TOTP 2FA (speakeasy) |
| **SMS** | Africa's Talking API |
| **Email** | Nodemailer (SMTP) |
| **WhatsApp** | Meta Cloud API |
| **Reports** | PDFKit (PDF generation), CSV export |
| **IoT Firmware** | ESP32 Arduino (C++), PlatformIO |
| **Infrastructure** | Docker Compose (PostgreSQL, Redis, Next.js, Nginx) |
| **Security** | AES encryption at rest, bcrypt API keys, SSL/TLS, CSRF protection |

**Total Dependencies**: 33 production + 19 development packages

---

## 3. WHAT HAS BEEN BUILT

### 3.1 Web Application

| Category | Count | Details |
|----------|-------|---------|
| **API Endpoints** | 46 | Auth, Admin, Device, Machine, Voucher, Sales, Organization |
| **Backend Services** | 20 | Core business logic modules |
| **Admin Pages** | 14 | Full management dashboard |
| **UI Components** | 13 | Reusable ShadCN-based components |
| **Database Models** | 11 | Multi-tenant PostgreSQL schema |
| **DB Migrations** | 4 | Schema evolution tracked |

### 3.2 ESP32 Firmware

| Category | Details |
|----------|---------|
| **Main Sketch** | 2,100+ line state machine with 10 operational states |
| **Modules** | 7 (WiFi, API client, Voucher, Heartbeat, NVS Storage, OTA, Sales) |
| **Source Files** | 15 (.ino + .cpp + .h) |
| **Hardware Support** | Flow sensor, pump relay, 4×4 keypad, I2C LCD, oil level sensor, temperature sensor |

### 3.3 Infrastructure

| Component | Details |
|-----------|---------|
| **Docker Services** | 4 containers (PostgreSQL 16, Redis 7, Next.js, Nginx) |
| **Dockerfile** | Multi-stage build (deps → build → minimal runner) |
| **Nginx** | Reverse proxy with TLS termination |
| **PWA** | Service worker + manifest for offline-capable dashboard |

---

## 4. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD (Docker)                           │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────┐   ┌───────────┐ │
│  │  Nginx   │──▶│  Next.js App │──▶│  Redis │   │ PostgreSQL│ │
│  │  (TLS)   │   │  (46 APIs)   │──▶│ (Cache) │   │  (11 Models)│
│  └──────────┘   └──────────────┘   └────────┘   └───────────┘ │
│       ▲                ▲                                        │
└───────┼────────────────┼────────────────────────────────────────┘
        │                │
        │         ┌──────┴──────┐
   Admin Web      │  HTTPS/TLS  │
   Dashboard      │  API Calls  │
   (Browser)      └──────┬──────┘
                         │
        ┌────────────────┼────────────────────┐
        │                │                    │
   ┌────▼────┐     ┌────▼────┐         ┌────▼────┐
   │  ESP32  │     │  ESP32  │   ...   │  ESP32  │
   │ Station │     │ Station │         │ Station │
   │    1    │     │    2    │         │  1000+  │
   └─────────┘     └─────────┘         └─────────┘
        │
   ┌────┴─────────────────────────┐
   │  4×4 Keypad  │  I2C LCD     │
   │  Flow Sensor │  Pump Relay  │
   │  Oil Level   │  Temp Sensor │
   └──────────────────────────────┘
```

---

## 5. KEY FEATURES COMPLETED

### 5.1 Voucher Management
- CSV bulk upload of beneficiary data (name, phone, amount)
- Automatic 6-digit unique voucher code generation
- SMS delivery via Africa's Talking + Email + WhatsApp notifications
- Voucher verification (status, expiry, phone match)
- Voucher redemption with actual litres dispensed tracking
- Batch management and batch revocation
- Voucher expiry (configurable, default 7 days)

### 5.2 IoT Machine Fleet Management
- Device registration with secure API key generation (bcrypt-hashed)
- Real-time heartbeat monitoring (configurable 10s–5min interval)
- Live dashboard with SSE (Server-Sent Events) streaming
- Oil level, temperature, pump cycles, uptime, WiFi RSSI tracking
- Machine telemetry history with charts (Recharts)
- Automated alerts: low oil, offline machines, high temperature, pump failure
- Per-machine price configuration (centrally managed)
- Inventory tracking with auto-decrement on each dispense

### 5.3 Over-The-Air (OTA) Firmware Updates
- Upload firmware binary to server
- Push updates via heartbeat response
- SHA-256 checksum verification before flashing
- ESP32 dual-partition failsafe (bad OTA → boots old firmware)

### 5.4 Offline Resilience
- NVS flash storage queues up to 100 transactions during WiFi/power outages
- Automatic retry and upload when connectivity restores (every 60s)
- Server-pushed config (price, heartbeat interval) persisted across reboots

### 5.5 ESP32 Dispenser — 3 Operating Modes
| Mode | How It Works |
|------|-------------|
| **Voucher** | Enter phone → enter code → server verifies → pump dispenses exact litres → server marks USED |
| **Cash** | Enter amount in ZMW → converts to litres at current price → pump dispenses |
| **Buy Litres** | Enter desired litres directly → pump dispenses |

### 5.6 Security
| Feature | Implementation |
|---------|---------------|
| Device authentication | API key (bcrypt-hashed, shown once on creation) |
| User authentication | JWT + Firebase Admin SDK |
| Two-factor auth | TOTP via speakeasy (setup, verify, backup codes) |
| Rate limiting | 200 requests/15 minutes per device, in-memory + Redis |
| CSRF protection | Origin/Referer header validation |
| Body size limit | 10MB max (DoS prevention) |
| Encryption at rest | AES via encryptionService |
| SSL/TLS | Let's Encrypt root CA pinned in firmware |

### 5.7 Admin Dashboard (14 Pages)
| Page | Functionality |
|------|-------------- |
| **Dashboard** | Overview stats, charts, real-time fleet status |
| **Upload** | CSV file upload for beneficiary data |
| **Vouchers** | View, filter, search all vouchers |
| **Generate Vouchers** | Batch generation with SMS/Email/WhatsApp delivery |
| **Machines** | IoT device list with status, telemetry, management |
| **Stations** | Station/location CRUD |
| **Users** | User management (create, edit, roles, bulk import) |
| **Beneficiaries** | Phone-based voucher history lookup |
| **Batches** | Batch tracking, revocation |
| **Sales** | Cash and voucher sales analytics |
| **Reports** | PDF and CSV export for all data |
| **Audit Trail** | Full compliance log of all system actions |
| **Settings** | System configuration |
| **Station Verify** | Tablet-optimized voucher verification UI |

### 5.8 Reporting & Export
- PDF report generation (PDFKit)
- CSV export for vouchers, sales, transactions
- Dashboard charts with Recharts (line, bar, pie)
- IoT telemetry charts (historical time-series)

### 5.9 Multi-Tenancy
- Organization-scoped data isolation
- Per-organization quotas (maxStations, maxMachines, maxUsers)
- Plans: STARTER, PROFESSIONAL, ENTERPRISE
- Organization API (v1) for management

---

## 6. DATABASE SCHEMA

**11 Models** across 4 migrations:

```
Organization ─┬─▶ User (ADMIN / STATION / READONLY)
               ├─▶ Station ──▶ Machine ──┬──▶ Sale
               │                          ├──▶ Transaction
               │                          └──▶ MachineTelemetry
               ├─▶ Voucher ──▶ SmsLog
               ├─▶ AuditLog
               └─▶ FirmwareRelease
```

**Key indexes optimized for scale:**
- `[voucherCode, phone]` — fast voucher lookup
- `[status, lastSeen]` — fleet status sweeps
- `[machineId, createdAt]` — telemetry time-series
- `[stationId, createdAt]` — station-level sales queries
- `[paymentType, createdAt]` — payment type analytics

---

## 7. API ENDPOINTS (46 Total)

### Authentication (6)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/2fa/setup` | Setup TOTP 2FA |
| POST | `/api/auth/2fa/verify` | Verify 2FA code |
| POST | `/api/auth/2fa/disable` | Disable 2FA |

### Device Communication (2)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/device/heartbeat` | Machine telemetry + config sync |
| POST | `/api/device/transaction` | Log dispense + update inventory |

### Voucher (2)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/voucher/verify` | Verify voucher (device or dashboard) |
| POST | `/api/voucher/redeem` | Mark voucher as used |

### Machine (8)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/machines/heartbeat` | Heartbeat processing |
| POST | `/api/machines/heartbeat/bulk` | Bulk heartbeat |
| GET | `/api/machines/status` | Fleet status overview |
| POST | `/api/machines/ota` | Trigger OTA update |
| GET | `/api/machines/monitoring` | Alert generation |
| GET | `/api/machines/inventory` | Inventory levels |
| GET | `/api/machines/stream` | SSE real-time events |
| CRUD | `/api/machines/[id]` | Individual machine management |

### Admin (22+)
Dashboard, vouchers, generate-vouchers, upload-csv, users, stations, sales, transactions, batches, beneficiaries, audit-logs, charts, iot-charts, reports/pdf, export, export/pdf, firmware, monitoring/errors, cleanup-seed

### Other (6)
Health check, Organizations CRUD (v1), Sales report

---

## 8. BACKEND SERVICES (20)

| Service | Responsibility |
|---------|---------------|
| `voucherService` | Generate, verify, redeem vouchers |
| `machineService` | Device CRUD, heartbeat processing, OTA management |
| `transactionService` | Transaction logging, inventory management |
| `salesService` | Cash/voucher sales recording and queries |
| `monitoringService` | Alert generation (low oil, offline, high temp) |
| `smsService` | Africa's Talking SMS delivery |
| `emailService` | Nodemailer email sending |
| `auditService` | Compliance action logging |
| `userService` | Firebase-based user CRUD |
| `stationService` | Station CRUD |
| `batchService` | Voucher batch management |
| `beneficiaryService` | Phone-based voucher history |
| `csvParser` | CSV upload parsing and validation |
| `encryptionService` | AES encryption at rest |
| `exportService` | CSV/PDF export generation |
| `pdfService` | PDF report generation (PDFKit) |
| `rateLimitService` | In-memory + Redis rate limiting |
| `scheduledTaskService` | Cron jobs (reports, log cleanup) |
| `twoFactorService` | TOTP 2FA management |
| `errorService` | File-based error logging |

---

## 9. ESP32 FIRMWARE ARCHITECTURE

### State Machine (10 States)
```
         ┌──────────────────────────────────────────────┐
         │                                              │
         ▼                                              │
    ┌─────────┐    #    ┌──────────────┐                │
    │  IDLE   │───────▶│ SELECT_MODE  │                │
    └─────────┘        └──────┬───────┘                │
         ▲              A │  B │  C │                   │
         │                │    │    │                   │
         │    ┌───────────▼┐ ┌▼────────────┐ ┌▼──────────┐
         │    │  VOUCHER   │ │    CASH     │ │BUY LITRES │
         │    │   PHONE    │ │   AMOUNT    │ │           │
         │    └─────┬──────┘ └──────┬──────┘ └─────┬─────┘
         │          ▼               │              │
         │    ┌───────────┐         │              │
         │    │  VOUCHER  │         │              │
         │    │   CODE    │         │              │
         │    └─────┬─────┘         │              │
         │          │               │              │
         │          ▼               ▼              ▼
         │    ┌─────────────────────────────────────┐
         │    │           DISPENSING                 │
         │    │  (Flow sensor counts pulses,        │
         │    │   pump runs until target reached)   │
         │    └──────────────┬──────────────────────┘
         │                   ▼
         │    ┌─────────────────────────────────────┐
         │    │           COMPLETE                   │
         │    │  (Report to cloud, log transaction)  │
         │    └──────────────┬──────────────────────┘
         │                   │
         └───────────────────┘
                (10s auto-return)
```

### Firmware Modules (7)
| Module | Lines | Purpose |
|--------|-------|---------|
| `wifi_manager` | ~80 | WiFi connection with exponential backoff reconnect |
| `api_client` | ~100 | HTTPS client with retry, SSL verification |
| `voucher_service` | ~80 | Verify & redeem vouchers via API |
| `heartbeat_service` | ~100 | Periodic telemetry, server config sync |
| `nvs_storage` | ~70 | Offline queue (100 sales) + persistent config |
| `ota_manager` | ~70 | OTA firmware update with SHA-256 verification |
| `sales_reporting` | ~70 | Transaction reporting + offline queue retry |

### Safety Features
- 60-second hardware watchdog timer
- 5-minute maximum dispense timeout
- No-flow detection (pump failure → stop after 5s)
- 50-litre maximum dispense safety cap
- ±20ml dispense tolerance
- Dual OTA partition (bad update → boots old firmware)

---

## 10. KEY DATA FLOWS

### Flow 1: Voucher Redemption
```
Beneficiary ──▶ Keypad (phone + code)
    │
    ▼
ESP32 ──POST──▶ /api/voucher/verify
    │              │
    │         DB: Check voucher status, phone, expiry
    │              │
    ◀──────────── { approved, litres: 5.0 }
    │
    ▼
Pump ON ──▶ Flow sensor counting pulses
    │         LCD: "Dispensing 2.3/5.0L"
    ▼
Pump OFF (target reached)
    │
    ▼
ESP32 ──POST──▶ /api/voucher/redeem
    │              │
    │         DB: Voucher → USED, Create Sale, Audit Log
    │         SSE: Push event to admin dashboard
    │              │
    ◀──────────── { success: true }
```

### Flow 2: Heartbeat + OTA
```
ESP32 (every 30s) ──POST──▶ /api/device/heartbeat
                              │
                         DB: Update lastSeen, status=ONLINE
                         Check: targetFirmware > current?
                              │
    ◀──────────────────────── { config, ota_update? }
    │
    ▼ (if OTA available)
HTTP GET firmware.bin ──▶ Verify SHA-256 ──▶ Flash OTA partition ──▶ Reboot
```

### Flow 3: Offline Recovery
```
WiFi Lost ──▶ NVS: pushOfflineSale()  ──▶ Power Lost
                                              │
                                         (NVS survives)
                                              │
                                         Power Restored
                                              │
WiFi Reconnects ──▶ Every 60s: processOfflineQueue()
    │                    │
    ▼                    ▼
POST /api/device/transaction (for each queued sale)
    │
    ▼
NVS: popOfflineSale() (on success)
```

---

## 11. SCALABILITY DESIGN

| Aspect | Target | Implementation |
|--------|--------|---------------|
| **Devices** | 1,000+ concurrent | 30s heartbeat = ~33 heartbeats/sec |
| **Transactions** | 50,000/day | Composite DB indexes, Redis caching |
| **Database** | PostgreSQL 16 | 200 connection pool, 256MB shared buffers |
| **Cache** | Redis 7 | 128MB, LRU eviction, AOF persistence |
| **Offline** | 100 queued sales | NVS circular buffer, auto-retry |
| **Rate Limiting** | 200 req/15min/device | In-memory + Redis fallback |
| **Horizontal Scale** | Docker replicas | Stateless app, shared DB/Redis |

---

## 12. DEPLOYMENT

### Docker Compose — 4 Services
```
┌─────────────────────────────────────────────────┐
│                  Docker Host                     │
│                                                  │
│  ┌───────┐   ┌─────────┐   ┌───────┐  ┌──────┐│
│  │ Nginx │──▶│ Next.js │──▶│ Redis │  │ PgSQL││
│  │ :443  │   │ :3000   │   │ :6379 │  │:5432 ││
│  │ 128MB │   │  512MB  │   │ 256MB │  │ 1GB  ││
│  └───────┘   └─────────┘   └───────┘  └──────┘│
└─────────────────────────────────────────────────┘
```

### Multi-Stage Dockerfile
```
Stage 1 (deps)    → npm ci --only=production
Stage 2 (builder) → prisma generate + next build
Stage 3 (runner)  → Minimal image, non-root user, port 3000
```

---

## 13. SUMMARY OF DELIVERABLES

| Deliverable | Status |
|-------------|--------|
| Next.js web application (14 admin pages) | ✅ Complete |
| 46 REST API endpoints | ✅ Complete |
| 20 backend services | ✅ Complete |
| PostgreSQL schema (11 models, 4 migrations) | ✅ Complete |
| ESP32 firmware (10-state machine, 7 modules) | ✅ Complete |
| Docker Compose deployment (4 services) | ✅ Complete |
| SMS notifications (Africa's Talking) | ✅ Complete |
| OTA firmware update system | ✅ Complete |
| Offline resilience (NVS queue) | ✅ Complete |
| Real-time dashboard (SSE) | ✅ Complete |
| PDF/CSV reporting | ✅ Complete |
| Multi-tenant architecture | ✅ Complete |
| 2FA authentication (TOTP) | ✅ Complete |
| Monitoring & alerts | ✅ Complete |
| Rate limiting & security | ✅ Complete |
| PWA support (service worker) | ✅ Complete |

---

*Pimisa Voucher System — Built for scale, designed for Zambia's oil distribution infrastructure.*
