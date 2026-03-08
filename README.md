# 📡 WiFi Hotspot Billing System

A multi-tenant hotspot billing platform that integrates with **MikroTik routers** and **M-Pesa Daraja API** for automated WiFi session payments in Kenya.

---

## ✨ Features

- 🏢 **Multi-tenant** – manage multiple hotspot locations from one platform
- 💳 **M-Pesa STK Push** – frictionless mobile payments via Daraja API
- 🌐 **MikroTik integration** – automatic session creation and revocation via RouterOS API
- 🎨 **Per-tenant branding** – custom colors, logo, and splash message for each location
- 📊 **Admin dashboard** – view sessions, transactions, and analytics per tenant
- ⚡ **Flexible plans** – hourly, daily, or weekly passes with optional data caps and speed limits
- 🔒 **Encrypted credentials** – MikroTik and M-Pesa secrets stored encrypted at rest

---

## 🏗️ System Architecture

```
Browser (React SPA)
       │
       ▼
Express Backend (TypeScript)
       │
  ┌────┴────┐
  │         │
  ▼         ▼
PostgreSQL  MikroTik Router
(Prisma ORM) (RouterOS API)
       │
       ▼
  M-Pesa Daraja API
```

In production the React frontend is compiled and served as static files directly by the Express server. See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown.

---

## 🧰 Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| pnpm | 10+ |
| PostgreSQL | 15+ |
| MikroTik RouterOS | 6.49+ |

> 💡 The backend's `package.json` specifies `pnpm@10.6.2` as the package manager. Use **pnpm** for all install commands.

---

## 🛠️ Technology Stack

**Frontend:** React · Vite · TypeScript · TailwindCSS  
**Backend:** Express · TypeScript · Prisma ORM  
**Database:** PostgreSQL  
**Payments:** M-Pesa Daraja STK Push  
**Router:** MikroTik RouterOS API (`node-routeros`)  

---

## ⚙️ Environment Variables

Copy the example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NODE_ENV` | ✅ | `development` or `production` |
| `SERVER_PORT` | ✅ | Port the server listens on (default `5000`) |
| `SERVER_IP` | ✅ | Bind address (use `0.0.0.0` for all interfaces) |
| `DOMAIN` | ✅ | Public URL of your server (used in M-Pesa callbacks) |
| `MPESA_CONSUMER_KEY` | ✅ | Daraja app consumer key |
| `MPESA_CONSUMER_SECRET` | ✅ | Daraja app consumer secret |
| `MPESA_SHORTCODE` | ✅ | Paybill or Till number |
| `MPESA_PASSKEY` | ✅ | Lipa Na M-Pesa passkey |
| `MPESA_CALLBACK_URL` | ✅ | Public HTTPS URL for payment callbacks |
| `ENCRYPTION_KEY` | ✅ | 32-character key for encrypting stored secrets |
| `MIKROTIK_HOST` | ⬜ | Router IP (optional for multi-tenant mode) |
| `MIKROTIK_USER` | ⬜ | Router API username |
| `MIKROTIK_PASS` | ⬜ | Router API password |
| `MIKROTIK_PORT` | ⬜ | RouterOS API port (default `8728`) |

Generate a secure encryption key with:

```bash
cd backend
pnpm generate-key
```

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/zilezarach/wifi-hotspot.git
cd wifi-hotspot
```

### 2. Install dependencies

```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
pnpm install
```

### 3. Configure environment variables

```bash
cd backend
cp .env.example .env
# Edit .env with your values
```

### 4. Set up the database

```bash
cd backend
# Run migrations
pnpm migrate

# (Optional) Seed example data
pnpm seed
```

### 5. Build the frontend

```bash
cd frontend
pnpm build
# Copy the built assets to the backend public folder
cp -r dist/* ../backend/public/
```

> 📝 The `public/` folder inside `backend/` is where Express serves the React app in production.

### 6. Start the server

**Development (hot-reload):**

```bash
cd backend
pnpm dev
```

**Production:**

```bash
cd backend
pnpm build
pnpm start
```

The server starts on `http://0.0.0.0:5000` by default.

---

## 🗄️ Database Setup

The project uses **Prisma** for database management.

```bash
cd backend

# Run all pending migrations
pnpm migrate

# Open Prisma Studio (GUI)
pnpm dlx prisma studio

# Seed example tenants and plans
pnpm seed
```

---

## 🏢 Portal Configuration

Each tenant (hotspot location) is identified by:

1. **Subdomain** – `java-cafe.yourdomain.com`
2. **Path** – `yourdomain.com/java-cafe`
3. **Query parameter** – `yourdomain.com?tenant=<mikrotik-id>`

Create a tenant via the admin API or use the seeding script to add example data. See [API_DOCS.md](API_DOCS.md) for the full API reference.

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| `Missing required environment variables` | Ensure all variables in `.env.example` are set in `.env` |
| `Database connection failed` | Check `DATABASE_URL` and that PostgreSQL is running |
| `MikroTik connection refused` | Verify `MIKROTIK_HOST`, API is enabled, and port 8728 is open |
| `M-Pesa callback not received` | `MPESA_CALLBACK_URL` must be a public HTTPS URL |
| Port already in use | Change `SERVER_PORT` in `.env` |

Run the environment validation helper at any time:

```bash
cd backend
pnpm validate-env
```

---

## 📚 Documentation

| File | Description |
|------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design and data flow diagrams |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide (PM2, Nginx, SSL) |
| [MIKROTIK_SETUP.md](MIKROTIK_SETUP.md) | MikroTik router configuration guide |
| [MPESA_INTEGRATION.md](MPESA_INTEGRATION.md) | M-Pesa Daraja API setup guide |
| [API_DOCS.md](API_DOCS.md) | REST API endpoint reference |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development guidelines and contribution process |

---

## 📜 License

ISC

---

## 📬 Contact

Raise an issue on [GitHub](https://github.com/zilezarach/wifi-hotspot/issues) for bugs or feature requests.
 
