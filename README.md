# Wallet Note

Internal business-management and accounting web application for:

- **3D number-record management** — sessions, bulk entry, exposure tracking, settlement, reopen with reversal
- **THB/MMK currency exchange** — rate board with history, buy/sell, profit calculation, atomic dual-wallet updates, reversal
- **Multi-wallet ledger** — double-entry-style ledger; balances only ever change through ledger entries
- **Customer credit & business payable** — partial collection/payment, aging, due dates
- **Income/expense, daily close, reports** — daily summaries, locking closed dates, CSV export, charts
- **RBAC** — six default roles, custom roles, granular permissions enforced server-side
- **Audit logs** — every important action recorded with before/after values
- **PWA** — installable, offline fallback (financial writes never complete silently offline)

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite (dev) / PostgreSQL (prod) · Vitest · Docker

## Money handling

All amounts are stored as **BigInt minor units** (1/100 of the currency unit) — never floating point.
Rates, odds, and percentages are decimal strings computed with `decimal.js`. See `src/lib/money.ts`.

## Quick start (development)

```bash
# 1. Install
npm install

# 2. Configure — copy the example env and set AUTH_SECRET
cp .env.example .env    # dev default DATABASE_URL="file:./dev.db" works out of the box

# 3. Database setup + migration
npx prisma migrate dev

# 4. Seed demo data
npx prisma db seed

# 5. Run
npm run dev
```

Open http://localhost:3000 and sign in.

### Development test credentials (seed data — development only)

| Username     | Role       | Password       |
| ------------ | ---------- | -------------- |
| `owner`      | Owner      | `Password123!` |
| `admin`      | Admin      | `Password123!` |
| `agent`      | Agent      | `Password123!` |
| `accountant` | Accountant | `Password123!` |

**Never use these credentials in production.** Create real users from *Users & Roles* and delete or disable the seed accounts.

## Commands

| Task             | Command                          |
| ---------------- | -------------------------------- |
| Install          | `npm install`                    |
| Database setup   | `npx prisma migrate dev`         |
| Migration (prod) | `npx prisma migrate deploy`      |
| Seed             | `npx prisma db seed`             |
| Development      | `npm run dev`                    |
| Testing          | `npm test`                       |
| Production build | `npm run build`                  |
| Production start | `npm start`                      |
| Docker deploy    | `docker compose -f docker/docker-compose.yml up -d --build` |

## Production deployment (Docker)

1. Copy `.env.example` → `.env` next to `docker/docker-compose.yml`; set `DB_PASSWORD`, `AUTH_SECRET`, `APP_URL`.
2. Switch the Prisma datasource provider in `prisma/schema.prisma` from `sqlite` to `postgresql` and commit a migration (`npx prisma migrate dev`) against a Postgres URL.
3. `docker compose -f docker/docker-compose.yml up -d --build`
4. Run migrations inside the container: `docker compose exec app npx prisma migrate deploy`
5. Health check: `GET /api/health`

### Backup & restore

- Backup: `docker compose exec db pg_dump -U walletnote walletnote > backup-$(date +%F).sql`
- Restore: `docker compose exec -T db psql -U walletnote walletnote < backup-YYYY-MM-DD.sql`
- Keep daily backups off-server; test restores regularly. SQLite dev DB is the single file `prisma/dev.db`.

## Architecture

```
src/
  app/            Next.js pages + /api/v1 REST route handlers
  components/     UI kit (Card, Table, Modal, toast…) + AppShell
  lib/            prisma, auth, api helpers, money, permissions, audit, sequence, dates
  services/       business logic (walletService, threeDService, exchangeService, creditService, summaryService)
prisma/           schema, migrations, seed
tests/            Vitest unit tests for financial calculations
docker/           Dockerfile, docker-compose.yml, nginx.conf
```

Key invariants:

- **Wallet balances** are only mutated by `walletService.postLedger`, always inside a DB transaction, with optimistic locking.
- **Settlements, exchanges, transfers, collections and payments** are transaction-safe; reversals create compensating ledger entries — history is never destroyed.
- **Closed dates** block new transactions (`closeGuard.assertDateOpen`); reopening requires a reason and is audited.
- **Permissions** are enforced in every API route via `withAuth(permission, handler)` — the frontend only hides buttons.
- **3D numbers** are 3-character strings; leading zeros are significant (`001` ≠ `010` ≠ `100`).

## API

Versioned REST under `/api/v1/*`: auth, dashboard, three-d (sessions/transactions/settle/reopen), exchange (rates/transactions/reverse), wallets (+ledger/adjust), wallet-transfers, reconciliations, receivables (+payments), payables (+payments), income-expense, categories, customers, daily-close (+reopen), reports (summary/export), users, roles, settings, audit-logs, branches.

All responses: `{ ok: true, data }` or `{ ok: false, error, details? }`. Money values are serialized as strings of minor units.

## Permission matrix (defaults)

| Role       | Highlights |
| ---------- | ---------- |
| Owner      | Everything, including settings and reopening closed records |
| Admin      | Everything except system settings |
| Agent      | 3D + exchange entry, own credit records; no company-wide profit |
| Cashier    | Wallet transfers, income/expense, collections/payments |
| Accountant | All accounting views, reconciliation, reports, daily close |
| Viewer     | Read-only |

Custom roles with any permission combination can be created in *Users & Roles*.
