# 🏛️ System Architecture

---

## Overview

The WiFi Hotspot Billing System is a **multi-tenant SaaS platform** that automates WiFi access control and payment collection for hotspot operators in Kenya.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Client Devices                        │
│          (phones, laptops connecting to WiFi)             │
└────────────────────────┬─────────────────────────────────┘
                         │  HTTP (hotspot redirect)
                         ▼
┌──────────────────────────────────────────────────────────┐
│               Express Backend Server                      │
│                                                           │
│  ┌─────────────────┐    ┌──────────────────────────┐     │
│  │  Portal Routes  │    │     Admin API Routes      │     │
│  │  /              │    │  /api/admin/*             │     │
│  │  /payment/...   │    └──────────────────────────┘     │
│  │  /session/...   │                                      │
│  └─────────────────┘    ┌──────────────────────────┐     │
│                         │   M-Pesa Callback Route   │     │
│  ┌─────────────────┐    │  /api/mpesa_callback      │     │
│  │  Static Files   │    └──────────────────────────┘     │
│  │  (React SPA)    │                                      │
│  └─────────────────┘                                      │
└───────┬──────────────────────┬───────────────────────────┘
        │                      │
        ▼                      ▼
┌───────────────┐    ┌─────────────────────┐
│  PostgreSQL   │    │  MikroTik Router(s) │
│  (Prisma ORM) │    │  (RouterOS API)     │
└───────────────┘    └─────────────────────┘
                               ▲
                               │ STK Push callback
                     ┌─────────────────────┐
                     │  Safaricom Daraja   │
                     │  M-Pesa API         │
                     └─────────────────────┘
```

---

## Frontend Architecture

| Technology | Role |
|------------|------|
| React 18 | UI framework |
| Vite | Build tool and dev server |
| TypeScript | Type safety |
| TailwindCSS | Utility-first CSS |

**Key components:**

- `Portal.tsx` – Captive portal page shown to hotspot users (plan selection, payment flow)
- `AdminDashboard.tsx` – Operator dashboard for managing tenants and viewing analytics
- `App.tsx` – Route configuration
- `lib/api.ts` – Typed API client

In production, the frontend is compiled (`pnpm build`) and the `dist/` output is copied to `backend/public/`. Express serves it as static files.

---

## Backend Architecture

| Technology | Role |
|------------|------|
| Express 4 | HTTP server and routing |
| TypeScript | Type safety |
| Prisma | Database ORM and migrations |
| Winston | Structured logging |
| node-routeros | MikroTik RouterOS API client |
| Axios | HTTP client for Daraja API calls |
| express-rate-limit | Payment endpoint rate limiting |

**Directory structure:**

```
backend/src/
├── server.ts          # Entry point – env validation, DB connection, server start
├── app.ts             # Express app – routes, middleware
├── controllers/
│   ├── portalController.ts   # Tenant detection, payment initiation, session status
│   └── adminController.ts    # CRUD for tenants, dashboard, analytics
├── services/
│   ├── mikrotik-service.ts   # RouterOS API abstraction (connect, bind, unbind)
│   └── mpesaService.ts       # Daraja STK Push, callback processing, encryption
└── utils/
    └── logger.ts             # Winston logger configuration
```

---

## Database Schema Overview

```
Tenant ─────────┬── Plan ─────── Session ─── Transaction
                │                    │
                ├── Session          │ (via planId)
                ├── Transaction      │
                └── RouterHeartbeat  │

AdminUser (standalone – system admins)
AuditLog  (standalone – action log)
SystemConfig (key-value global settings)
```

**Key relationships:**

- Each `Tenant` represents one hotspot location with its own MikroTik router and (optionally) M-Pesa credentials
- Each `Tenant` has multiple `Plan`s (e.g., 1 Hour, 1 Day, 1 Week)
- A `Session` is created when a user selects a plan and payment is pending/confirmed
- A `Transaction` records the M-Pesa payment associated with a session

---

## Multi-Tenancy

Each request to the portal is matched to a `Tenant` record using three strategies (tried in order):

1. **Subdomain** – `java-cafe.yourdomain.com` → slug `java-cafe`
2. **Path segment** – `yourdomain.com/java-cafe` → slug `java-cafe`
3. **Query parameter** – `yourdomain.com?tenant=<mikrotikId>` → matched by `mikrotikId`

Each tenant has its own:
- MikroTik router credentials (encrypted in database)
- Optional M-Pesa credentials (falls back to global env vars)
- Branding (color, logo, splash message)
- Plans

---

## Payment Flow

```
1. User selects plan on portal
2. POST /payment/initiate { phoneNumber, planId, mac }
3. Backend:
   a. Creates Transaction (status=PENDING)
   b. Creates Session (status=PENDING)
   c. Calls Daraja STK Push API
   d. Returns checkoutRequestId to frontend
4. Frontend polls /session/status every 3s
5. Safaricom calls POST /api/mpesa_callback
6. Backend:
   a. Finds Transaction by checkoutRequestId
   b. If ResultCode=0:
      - Updates Transaction (status=COMPLETED)
      - Updates Session (status=ACTIVE, sets expiresAt)
      - Calls MikroTik API to create IP binding
   c. If ResultCode≠0:
      - Updates Transaction (status=FAILED/CANCELLED)
      - Updates Session (status=CANCELLED)
7. Frontend detects ACTIVE session → shows success screen
```

---

## Session Management Flow

```
Session created (PENDING)
       │
       ▼
Payment confirmed → ACTIVE
       │
  ┌────┴────┐
  │         │
  ▼         ▼
Time      Data cap
expires   reached
  │         │
  └────┬────┘
       ▼
   EXPIRED / DATA_EXCEEDED
       │
       ▼
MikroTik IP binding removed
```

A cron job (configured in the backend) periodically checks for expired sessions and removes their MikroTik bindings.

---

## MikroTik Integration Flow

```
Backend ──(RouterOS API port 8728)──► MikroTik Router
  │                                         │
  │  /ip hotspot ip-binding add             │
  │  mac=AA:BB address=x.x.x.x type=regular│
  │                                         │
  ◄──────────── response ──────────────────┘
```

The `mikrotik-service.ts` manages a pool of connections, one per tenant, and provides:
- `connect(tenant)` – establish API connection
- `bindUser(mac, ip)` – grant internet access
- `unbindUser(mac)` – revoke internet access
- `disconnectAll()` – clean shutdown

---

## Technology Choices Rationale

| Choice | Reason |
|--------|--------|
| PostgreSQL + Prisma | Strong relational model for multi-tenant data; Prisma provides type-safe queries and schema migrations |
| Express | Lightweight; sufficient for the API surface; familiar ecosystem |
| React + Vite | Fast dev experience; single-page app served from backend in production |
| node-routeros | Well-maintained RouterOS API client for Node.js |
| Winston | Structured logging with file and console transports |
| pnpm | Fast, disk-efficient package manager; specified in `packageManager` field |
