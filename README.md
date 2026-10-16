# Canteen Khata & Management System

A digital replacement for a family-run canteen's paper khata: customer/office
accounts, daily food consumption tracking, monthly billing, partial payments,
expenses, and profit/loss reporting.

> **Status: implemented.** The Express/TypeScript REST API and the full
> Next.js admin UI are built. The backend tests and frontend production build
> cover the current application. The optional backend initializer creates
> system expense categories only; it does not create demo business records.
> See
> [`docs/PLAN.md`](./docs/PLAN.md) for the full architecture.
> [`docs/CODEBASE_GRAPH.md`](./docs/CODEBASE_GRAPH.md) maps the current module
> dependencies and key request/data flows; regenerate its file-level graph
> with `node scripts/graphify.mjs`.

---

## 1. Technology Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Next.js (App Router), TypeScript, React, Tailwind CSS, Lucide icons |
| Backend   | Node.js, Express, TypeScript, REST API |
| Database  | MongoDB + Mongoose |
| Auth      | JWT in an HttpOnly cookie, plus an origin/referer CSRF check |

## 2. Folder Structure

```
canteen-khata/
├── backend/               Express + TypeScript REST API
│   ├── config/            env loading, DB connection
│   ├── models/            Mongoose schemas
│   ├── controllers/       request handlers
│   ├── routes/            Express routers (one per resource)
│   ├── middleware/        auth, CSRF, validation, error handling
│   ├── services/          business logic (billing, payments, reports)
│   ├── utils/             logger, ApiError, asyncHandler, response envelope
│   ├── validators/        Zod schemas
│   ├── seed/              safe system-category initializer (no demo data)
│   ├── tests/             Jest + Supertest + mongodb-memory-server
│   ├── app.ts             Express app assembly
│   └── server.ts          Entrypoint (connects DB, starts HTTP server)
│
├── frontend/               Next.js admin UI
│   ├── app/
│   │   ├── (auth)/         /login, /setup
│   │   └── (admin)/        dashboard, khaja, khatas, offices, staff, items,
│   │                       bills, payments, expenses, reports, audit-logs, settings
│   ├── components/
│   │   ├── layout/         AdminShell (sidebar + mobile drawer)
│   │   └── ui/             Button, Input, Card, Badge, Modal, Table, Spinner,
│   │                       PageHeader, EmptyState, Pagination, StatCard, ConfirmDialog
│   ├── lib/
│   │   ├── services/       one module per resource (auth, khata, operation, insight)
│   │   └── apiClient.ts    the only place `fetch()` is called
│   ├── providers/          AuthProvider, ToastProvider, Providers
│   ├── hooks/              useAsync, useDebounce
│   ├── utils/              money.ts (paisa <-> NPR), date.ts (Kathmandu business dates), cn.ts
│   ├── types/              API types
│   └── proxy.ts            route guard (UX only; the API is the real gate)
│
├── docs/PLAN.md            Full architecture plan and edge-case catalogue
├── docker-compose.yml      Optional local MongoDB
└── README.md
```

## 3. Prerequisites

- Node.js 20+
- npm 10+
- MongoDB 7 (local install, `docker compose up -d`, or a MongoDB Atlas cluster)

## 4. Installation

```bash
git clone <this-repo>
cd canteen-khata

# Backend
cd backend
cp .env.example .env      # then edit .env — see section 5
npm install

# Frontend
cd ../frontend
cp .env.example .env      # then edit if your API isn't on localhost:5000
npm install
```

## 5. Environment Variables

### `backend/.env`

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` |
| `PORT` | API port (default `5000`) |
| `TZ` | Must be `Asia/Kathmandu` — all business-date math depends on this |
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | Long random string — **never commit this** |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `ADMIN_SETUP_TOKEN` | One-time token to create the first admin |
| `FRONTEND_URL` | Frontend URL, always CORS-allowed (default `http://localhost:3000`; `https://billingsite-bay.vercel.app` when `NODE_ENV=production`) |
| `CORS_ORIGIN` | Optional extra comma-separated allowed origin(s) |
| `COOKIE_NAME` | Name of the auth cookie (default `canteen_token`) |

### `frontend/.env.local`

| Variable | Description |
|---|---|
| `BACKEND_URL` | Backend origin `/api/*` is proxied to (default `http://localhost:5000`; `https://billingsite.onrender.com` in production builds) |
| `COOKIE_NAME` | Must match the backend's `COOKIE_NAME` |
| `NEXT_PUBLIC_API_URL` | Optional: call the API directly instead of via the `/api` proxy. Leave unset in production. |

**Never commit `.env`, JWT secrets, or MongoDB credentials.** Both `.env` files are gitignored; only `.env.example` is tracked.

## 6. MongoDB Setup

**Option A — Docker (recommended for local dev):**
```bash
docker compose up -d
# MONGODB_URI=mongodb://127.0.0.1:27017/canteen-khata
```

**Option B — MongoDB Atlas (recommended for production):**
Create a free/shared cluster, add a database user, allow your server's IP,
and copy the `mongodb+srv://...` connection string into `MONGODB_URI`.
For local development, add your current public IP under Atlas **Security →
Network Access**. Atlas blocks connections from IPs that are not on this list;
do not use `0.0.0.0/0` as a workaround.

The browser calls `/api` on the frontend, which Next.js proxies to
`http://localhost:5000`. If you change the backend port, set `BACKEND_URL` in
`frontend/.env.local` to `http://localhost:<port>`, and set `FRONTEND_URL` in
`backend/.env` if the frontend is not on `http://localhost:3000`. Restart the
frontend after changing its environment file.

## 7. First-Run Setup

The first admin is created once via `POST /api/auth/setup`, gated by
`ADMIN_SETUP_TOKEN`; the endpoint self-disables as soon as an admin exists.
The frontend exposes this at `/setup` and the normal login at `/login`.

To initialize the standard expense categories without creating sample
customers, items, transactions, or bills, run `npm run seed` from `backend/`.
The dashboard starts with live, zero-valued totals and empty states until you
add real records through the admin UI.

## 8. Running in Development

```bash
# Terminal 1 — backend
cd backend
npm run dev          # starts on http://localhost:5000

# Terminal 2 — frontend
cd frontend
npm run dev          # starts on http://localhost:3000
```

Verify the backend is up:
```bash
curl http://localhost:5000/api/health
# { "success": true, "data": { "status": "ok", "db": "connected", ... } }
```

## 9. Production Build

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

## 10. Testing

```bash
cd backend
npx jest --runInBand --no-color
```

Backend tests use an in-memory MongoDB (`mongodb-memory-server`), so no real
database is touched and no network access is required to run them. The suite
covers auth, the khata/boss/staff hierarchy, consumption + daily aggregation,
billing, FIFO payment allocation, expenses, reports and audit logging, plus a
regression suite (currently 3 suites / 39 tests, all passing).

Frontend checks:
```bash
cd frontend
npx tsc --noEmit      # type check
npm run lint          # eslint
npm run build         # production build
```

## 11. API Overview

All endpoints are under `/api`, return JSON in the envelope
`{ success, data, meta? }` on success or `{ success: false, code, message, details? }`
on error, and require an HttpOnly auth cookie for everything except
`/api/auth/setup`, `/api/auth/login` and `/api/health`.

Paginated list endpoints return `data: { rows }` plus a `meta` object; note
that `/api/audit-logs` and `/api/reports/audit-logs` return `data` as a bare
array with a `meta` object.

```
POST   /api/auth/setup                first-run only, ADMIN_SETUP_TOKEN
POST   /api/auth/login                rate-limited (5/15min/IP)
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/khatas                    ?q&type&status&officeId&page&limit
POST   /api/khatas
GET    /api/khatas/:id
PATCH  /api/khatas/:id
PATCH  /api/khatas/:id/status         ACTIVE ↔ OFFLINE
POST   /api/khatas/:id/archive
GET    /api/khatas/:id/summary

GET    /api/offices/:khataId/bosses   (alias of /api/bosses/offices/:khataId/bosses)
POST   /api/offices/:khataId/bosses
GET    /api/bosses/offices/:khataId/bosses
POST   /api/bosses/offices/:khataId/bosses
GET    /api/bosses/:id/summary        (alias: GET /api/bosses/:id)
PATCH  /api/bosses/:id
PATCH  /api/bosses/:id/activate
PATCH  /api/bosses/:id/deactivate
DELETE /api/bosses/:id                → deactivate

GET    /api/staff                     ?q&khataId&bossId&status
POST   /api/staff
PATCH  /api/staff/:id
PATCH  /api/staff/:id/status
PATCH  /api/staff/:id/transfer        { bossId }   (alias: POST)
GET    /api/items                     ?q&category&isActive&page&limit
POST   /api/items
GET    /api/items/:id
PATCH  /api/items/:id
POST   /api/items/:id/deactivate
DELETE /api/items/:id                 → soft (isActive:false)

GET    /api/customers/search          unified: individuals + bosses + staff

POST   /api/consumption
GET    /api/consumption               ?date&khataId&bossId&consumerId&itemId&page
POST   /api/consumption/:id/void      { reason }   (alias: PATCH)
GET    /api/consumption/daily         ?date&khataId&bossId

POST   /api/bills/generate            { khataId, bossId?, periodStart, periodEnd }
GET    /api/bills                     ?khataId&bossId&status&page
GET    /api/bills/:id
POST   /api/bills/:id/void            { reason }
GET    /api/bills/:id/print

POST   /api/payments
GET    /api/payments                  ?khataId&method&from&to&page
GET    /api/payments/:id
POST   /api/payments/:id/void         { reason }

GET    /api/expense-categories
POST   /api/expense-categories
GET    /api/expenses                  ?from&to&categoryId&page
POST   /api/expenses
PATCH  /api/expenses/:id
DELETE /api/expenses/:id

GET    /api/dashboard                 (alias of /api/dashboard/overview)
GET    /api/dashboard/overview
GET    /api/dashboard/outstanding
GET    /api/reports/sales             ?from&to&groupBy=day|item|office
GET    /api/reports/expenses
GET    /api/reports/profit-loss
GET    /api/reports/outstanding
GET    /api/reports/customers
GET    /api/reports/items
GET    /api/reports/offices
GET    /api/reports/collections
GET    /api/reports/audit-logs

GET    /api/audit-logs                ?entity&entityId&adminId&page
GET    /api/settings/profile
PATCH  /api/settings/profile
GET    /api/health
```

**Middleware chain:**
```
helmet → cors(credentials) → cookieParser → rateLimit(login only)
       → json(bodyLimit) → mongoSanitize → csrfProtection → requireAuth
       → requireRole('ADMIN') → validate(zodSchema) → controller
       → asyncHandler → errorHandler
```

## 12. Database Architecture & Business Rules

See [`docs/PLAN.md`](./docs/PLAN.md) for:
- Full Mongoose schema definitions per collection
- The Khata / Boss / Staff / billable-entity model and why it's shaped this way
- Billing and payment (FIFO allocation) algorithms
- The consumption-aggregation strategy (event log + daily read model)
- The full edge-case catalogue (E-1 .. E-21)
- Index list

## 13. Deployment

Suggested architecture:

```
Next.js frontend  →  Express/Node backend  →  MongoDB Atlas
```

- Deploy the backend and frontend as two separate services (e.g. Render/
  Railway/Fly.io for the API, Vercel for Next.js) or both on one VM behind a
  reverse proxy.
- Live: frontend https://billingsite-bay.vercel.app, API
  https://billingsite.onrender.com.
- The browser only talks to the frontend: Next.js rewrites `/api/*` to
  `BACKEND_URL` (see `frontend/next.config.mjs`), so the HttpOnly auth cookie
  is first-party and visible to the route guard in `frontend/proxy.ts`.
- Backend (Render, root `backend`): build `npm install --include=dev && npm run build`,
  start `npm start`; env `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`,
  `ADMIN_SETUP_TOKEN`, `FRONTEND_URL=https://billingsite-bay.vercel.app`.
- Frontend (Vercel, root `frontend`): env `BACKEND_URL=https://billingsite.onrender.com`,
  and `COOKIE_NAME` if the backend sets one. Leave `NEXT_PUBLIC_API_URL`
  unset, or the cookie becomes third-party.
- Take regular MongoDB backups (Atlas has automated backups on paid tiers;
  for self-hosted Mongo use `mongodump` on a schedule).

## 14. Business Rules (enforced in the service layer)

1. Inactive/offline Khatas cannot receive new consumption records.
2. Historical transactions and bills are never destroyed — only voided/superseded.
3. Changing an item's price never changes past transactions (price is snapshotted).
4. Recording a payment never deletes or zeroes out the bill.
5. Partial payments leave a tracked remaining balance.
6. Overpayment becomes credit, auto-applied to the next bill.
7. Names are never used as an identifier — every person has a unique ID and a
   displayed context line (e.g. "Sita — ABC Office • Boss: Ram").
8. An office can have multiple bosses, each an independently billable group.
9. A boss can have multiple staff.
10. Each staff member can be billed to the office group or have a separate
    staff balance. Staff-paid bills and payments remain associated with the
    office and identify the staff member; changing this setting affects only
    future orders.
11. A person may also have a separate individual Khata in addition to an
    office staff record. These are separate ledgers and are selected separately
    when recording consumption.
12. The same item ordered more than once in a day aggregates into one daily line.
13. Each Khata can have its own billing start date, independent of the calendar month.
14. Financial records are archived/voided, never hard-deleted.

---

Built per the phases in [`docs/PLAN.md`](./docs/PLAN.md) §15.
