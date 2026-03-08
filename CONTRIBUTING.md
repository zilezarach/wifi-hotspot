# 🤝 Contributing Guide

Thank you for your interest in contributing to the WiFi Hotspot Billing System!

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+
- pnpm 10+
- PostgreSQL 15+
- A MikroTik router (or RouterOS in GNS3/simulation for testing)

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/wifi-hotspot.git
cd wifi-hotspot
```

### 2. Install dependencies

```bash
cd backend && pnpm install
cd ../frontend && pnpm install
```

### 3. Configure environment

```bash
cd backend
cp .env.example .env
# Fill in your local development values
```

### 4. Start the database

```bash
cd backend
docker-compose up -d   # starts a local PostgreSQL instance
pnpm migrate
pnpm seed              # optional: load example data
```

### 5. Start development servers

```bash
# Terminal 1 – backend (hot-reload)
cd backend && pnpm dev

# Terminal 2 – frontend (Vite HMR)
cd frontend && pnpm dev
```

Frontend runs on `http://localhost:5173`, proxied to the backend on `http://localhost:5000`.

---

## 🎨 Code Style

- **TypeScript** everywhere – no `any` unless unavoidable
- **Prisma** for all database access – no raw SQL
- Use `async/await`; avoid callbacks
- Keep controllers thin – business logic belongs in services
- Log meaningful messages with Winston (`logger.info`, `logger.error`)

### Formatting

There is no enforced formatter yet. Follow the existing style:
- 2-space indentation
- Double quotes for strings
- Trailing commas in objects/arrays

---

## 🌿 Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-description>` | `feat/tenant-analytics` |
| Bug fix | `fix/<short-description>` | `fix/session-expiry-cron` |
| Documentation | `docs/<short-description>` | `docs/api-reference` |
| Refactor | `refactor/<short-description>` | `refactor/mikrotik-service` |

---

## ✏️ Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Examples:**

```
feat(payments): add M-Pesa callback retry logic
fix(sessions): prevent duplicate active sessions for same MAC
docs(api): document /payment/initiate endpoint
chore(deps): update prisma to 6.x
```

---

## 🔀 Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with focused commits
3. Run the validation helper before submitting:
   ```bash
   cd backend && pnpm validate-env
   ```
4. Ensure the backend compiles without errors:
   ```bash
   cd backend && pnpm build
   ```
5. Open a PR with:
   - A clear title following commit conventions
   - A description explaining **what** and **why**
   - Screenshots for UI changes

---

## 🧪 Testing Requirements

There is currently no automated test suite. Manual testing is required:

- Test payment flow end-to-end in the Daraja sandbox
- Verify MikroTik binding is created and removed correctly
- Test with multiple tenant configurations
- Verify environment variable validation catches missing vars

When adding tests in the future, place them in `backend/src/__tests__/` and use Jest.

---

## 🔍 Code Review Process

- All PRs require at least one review before merging
- Address all review comments or explain why you disagree
- Squash commits before merging if the history is noisy

---

## 🐛 Reporting Bugs

Open a [GitHub Issue](https://github.com/zilezarach/wifi-hotspot/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, RouterOS version)
- Relevant log output (from `backend/error.log` or PM2 logs)

---

## 💡 Suggesting Features

Open a GitHub Issue with the **enhancement** label. Describe:
- The problem you're solving
- Your proposed solution
- Any alternatives you considered
