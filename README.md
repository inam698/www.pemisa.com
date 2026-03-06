# Pimisa Voucher System

A production-grade web application for distributing and redeeming cooking oil vouchers to beneficiaries using phone numbers.

## Features

- **Admin Portal** — CSV upload, voucher generation, dashboard metrics, voucher management
- **Station Portal** — Simple tablet-optimized interface for voucher verification and redemption
- **SMS Delivery** — Automated voucher delivery via Africa's Talking SMS
- **Security** — JWT auth, rate limiting, input validation, brute-force protection
- **Expiry** — Vouchers auto-expire after 7 days

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS, ShadCN UI |
| Backend | Next.js API Routes, REST architecture |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT (bcrypt password hashing) |
| SMS | Africa's Talking (Twilio-ready) |
| Infra | Docker, docker-compose |

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL (or Docker)

### 1. Clone and Install

```bash
cd pimisa-voucher-system
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your database URL and SMS credentials
```

### 3. Start Database (Docker)

```bash
docker-compose up -d db
```

Or use an existing PostgreSQL instance and update `DATABASE_URL` in `.env`.

### 4. Run Migrations & Seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pimisa.com | Admin@123 |
| Station (Lusaka) | lusaka@pimisa.com | Station@123 |
| Station (Kitwe) | kitwe@pimisa.com | Station@123 |
| Station (Ndola) | ndola@pimisa.com | Station@123 |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | Public | User login |
| POST | `/api/admin/upload-csv` | Admin | Upload and validate CSV |
| POST | `/api/admin/generate-vouchers` | Admin | Generate vouchers from validated data |
| GET | `/api/admin/dashboard` | Admin | Dashboard metrics |
| GET | `/api/admin/vouchers` | Admin | Paginated voucher list |
| POST | `/api/voucher/verify` | Station/Admin | Verify voucher code |
| POST | `/api/voucher/redeem` | Station/Admin | Redeem voucher |

---

## CSV Format

Upload a CSV file with these columns:

```csv
Name,Phone,VoucherAmount
John Doe,0977123456,30
Jane Smith,+260966789012,50
```

A sample file is included: `sample-data.csv`

### Validation Rules

- **Name**: Required, non-empty
- **Phone**: Valid Zambian format (0977..., +260977..., 260977...)
- **VoucherAmount**: Required, positive number
- No duplicate phone numbers per upload
- One active voucher per phone number (system-wide)

---

## SMS Format

```
Pimisa Oil Voucher

Amount: K30
Voucher Code: 483921

Present this code at any Pimisa station within 7 days.
```

In development, SMS messages are logged to the console (sandbox mode).

---

## Project Structure

```
pimisa-voucher-system/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed script
├── src/
│   ├── app/
│   │   ├── (auth)/login/      # Login page
│   │   ├── admin/             # Admin portal pages
│   │   │   ├── dashboard/     # Dashboard metrics
│   │   │   ├── upload/        # CSV upload
│   │   │   └── vouchers/      # Voucher list
│   │   ├── station/           # Station portal
│   │   │   └── verify/        # Verify & redeem
│   │   └── api/               # API routes
│   │       ├── auth/login/
│   │       ├── admin/
│   │       └── voucher/
│   ├── components/ui/         # ShadCN UI components
│   ├── lib/
│   │   ├── auth/              # JWT utilities, AuthContext
│   │   ├── db/                # Prisma client singleton
│   │   ├── utils/             # Utilities, API client
│   │   └── validators/        # Zod schemas
│   ├── middleware/             # Auth & rate limiting middleware
│   ├── services/              # Business logic
│   │   ├── csvParser.ts       # CSV parsing & validation
│   │   ├── smsService.ts      # SMS integration
│   │   └── voucherService.ts  # Voucher CRUD operations
│   └── types/                 # TypeScript type definitions
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Production Deployment

### Docker

```bash
# Build and run entire stack
docker-compose up -d

# Run migrations
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx prisma db seed
```

### Environment Variables (Production)

```env
DATABASE_URL=postgresql://user:pass@host:5432/pimisa_vouchers
JWT_SECRET=<random-64-char-string>
SMS_PROVIDER=africastalking
AT_API_KEY=<your-production-key>
AT_USERNAME=<your-username>
NODE_ENV=production
```

---

## Security Features

- **JWT Authentication** with bcrypt password hashing (cost factor 12)
- **Rate Limiting** (in-memory, configurable per endpoint)
  - Login: 10 attempts / 15 min
  - Voucher verify: 5 attempts / 15 min (brute-force protection)
  - General API: 100 requests / 15 min
- **Input Validation** via Zod schemas on all endpoints
- **XSS Prevention** via input sanitization and CSP headers
- **SQL Injection Prevention** via Prisma ORM parameterized queries
- **Atomic Redemption** via database transactions (prevents double-spend)
- **Security Headers** (X-Frame-Options, HSTS, CSP, etc.)

---

## License

Proprietary — Pimisa Enterprises Limited
