# Canteen Khata & Management System — Architecture Plan

> Approved. This is the reference document for every build phase. Schema
> definitions here are conceptual/JSON-shorthand; the authoritative Mongoose
> code lives in `backend/models/` and may add fields (timestamps,
> Mongoose-specific options) not shown here.

## 1. System Architecture

Two deployable apps in one repo (Next.js + Express, not Next.js API routes):

```
canteen-khata/
├── backend/          Express + TS + Mongoose  → REST API
├── frontend/         Next.js + TS + Tailwind  → Admin UI
└── README.md
```

**Runtime flow**

```
Browser (Next.js, admin UI)
   │  fetch with credentials: 'include'
   ▼
Express API  ──►  middleware chain  ──►  Controller ──► Service ──► Mongoose Model
   │                                         │
   │                                         └──► AuditLog
   ▼
MongoDB (Atlas in prod, local in dev)
```

Why a separate Express API instead of Next.js route handlers: the spec asks
for a REST API with controllers/services/models layering, and keeping the
API standalone means a future customer-facing app can reuse the same
endpoints without rewriting them.

**Cross-cutting decisions**

| Concern | Decision |
|---|---|
| Money | Integer paisa everywhere (`*Paisa` suffix). No floats. 1 NPR = 100 paisa. |
| Timezone | Business dates stored as `businessDate: 'YYYY-MM-DD'` computed in Asia/Kathmandu via dayjs.tz. Timestamps stored as UTC `Date`. |
| Validation | Zod schemas; backend is the source of truth, never trust the frontend alone. |
| Errors | Central error middleware → `{ success:false, code, message, details? }`. Never leak raw Mongo errors. |
| Multi-doc writes | Mongo sessions/transactions for: transaction+dailyAggregate, bill+audit, payment+allocations. |

## 2. The Core Domain Decision

The spec contains a real tension: §4 says a Khata is the billing account of
either an individual OR an office; §7 says do NOT assume Office = one bill —
an office can have multiple billing groups (one per boss). These can't both
be literally true unless the ACCOUNT is separated from the BILLABLE UNIT.

**Resolution: Khata is the account root; the billable entity is polymorphic.**

```
Khata (type = INDIVIDUAL)
   └── billable entity = itself

Khata (type = OFFICE)
   ├── Boss "Ram"    → billable entity #1  (own ledger, own bills, own payments)
   ├── Boss "Shyam"  → billable entity #2
   └── Boss "Sita"   → billable entity #3
```

A billable entity is identified by the pair `(khataId, bossId?)`:
- `bossId = null` + khata type `INDIVIDUAL` → that individual
- `bossId = <id>` + khata type `OFFICE` → that boss's group

Every financial document (`ConsumptionTransaction`, `DailyConsumption`,
`Bill`, `Payment`) carries `khataId` AND optional `bossId`. This gives both
views for free:
- Boss-level: `filter({ bossId })`
- Office-level rollup: `filter({ khataId })` — sums across all bosses
- Khata Overview "Current Due": sum of unpaid bill dues for that `khataId`

The person who ate is a separate axis — the **consumer**:
```
consumerType: 'INDIVIDUAL' | 'BOSS' | 'STAFF'
consumerId:   ObjectId
consumerNameSnapshot:    string   // e.g. "Sita"
consumerContextSnapshot: string   // e.g. "ABC Office • Boss: Ram"
```

`consumerType`/`consumerId` answers "who ate?"; `(khataId, bossId)` answers
"who pays?". This lets Sita's momo land on Ram's bill while Sita remains a
distinct person, and it survives Sita being moved to Shyam's group later.

## 3. Database Schema

13 collections.

### 3.1 Admin
```
{ _id, name, email (unique, lowercase), passwordHash,
  role: 'ADMIN', isActive, lastLoginAt, createdAt, updatedAt }
```

### 3.2 Khata — the account root
```
{
  _id, khataCode: String (unique, e.g. "KH-000123"),
  type: 'INDIVIDUAL' | 'OFFICE',
  displayName, searchName (lowercased, indexed),
  phone, address,
  status: 'ACTIVE' | 'OFFLINE',
  startDate: 'YYYY-MM-DD', endDate: String | null,
  billingCycle: 'MONTHLY', billingStartDay: Number (1..28),
  openingBalancePaisa: Number,   // migrated paper dues, no fake transactions
  notes, createdBy, createdAt, updatedAt
}
```
Indexes: `{khataCode}` unique, `{type,status}`, `{searchName}`,
text index on `displayName, phone, khataCode`.

### 3.3 Boss — office billing group
```
{ _id, khataId (ref Khata, type OFFICE), name, phone,
  isDefault: Boolean,   // the "Office Direct" group
  status: 'ACTIVE' | 'INACTIVE', startDate, endDate, notes, createdAt, updatedAt }
```
Index: `{khataId, status}`.

### 3.4 Staff — the consumer under a boss
```
{ _id, khataId, bossId, name, searchName, phone,
  status: 'ACTIVE' | 'INACTIVE', startDate, endDate, notes, createdAt, updatedAt }
```
Indexes: `{khataId,status}`, `{bossId,status}`, `{searchName}`.

There is deliberately **no** Individual collection — an individual customer
IS a Khata of type INDIVIDUAL, with its own khata._id as the consumerId.

### 3.5 Item
```
{ _id, name, searchName, category,
  sellingPricePaisa, costPricePaisa: Number | null,
  unit, isActive, description, createdBy, createdAt, updatedAt }
```
No price-history array — history lives entirely in transaction snapshots
and AuditLog.

### 3.6 ConsumptionTransaction — immutable event log
```
{ _id, transactionCode,
  khataId, bossId: ObjectId | null,
  consumerType, consumerId, consumerNameSnapshot, consumerContextSnapshot,
  itemId, itemNameSnapshot, unitPricePaisa, unitCostPaisa: Number | null,
  quantity, totalPaisa,
  businessDate: 'YYYY-MM-DD', occurredAt: Date (UTC),
  entryType: 'ORDER' | 'REVERSAL', reversesTransactionId: ObjectId | null,
  status: 'ACTIVE' | 'VOIDED', voidedBy, voidedAt, voidReason,
  notes, createdBy, createdAt, updatedAt
}
```
Indexes: `{khataId,businessDate}`, `{consumerId,businessDate}`,
`{bossId,businessDate}`, `{itemId,businessDate}`, `{businessDate}`.

Corrections are never in-place edits — they write a `REVERSAL` row plus a
fresh `ORDER` row if needed, so both the mistake and the correction stay
visible (§22, §52, §53).

### 3.7 DailyConsumption — the fast read model
Grain: **one document per `(consumerId, businessDate, itemId, unitPricePaisa)`**.
```
{ _id, khataId, bossId, consumerType, consumerId,
  consumerNameSnapshot, consumerContextSnapshot,
  itemId, itemNameSnapshot, unitPricePaisa, unitCostPaisa,
  businessDate, quantity ($inc'd), totalPaisa ($inc'd), updatedAt }
```
Index: `{consumerId, businessDate, itemId, unitPricePaisa}` UNIQUE — this is
the whole aggregation strategy (see §8 below).

### 3.8 Bill
```
{ _id, billNumber (unique, from Counters, e.g. "INV-2026-000001"),
  khataId, bossId, scope: 'INDIVIDUAL' | 'BOSS_GROUP' | 'OFFICE',
  payerNameSnapshot, periodStart, periodEnd, generatedAt,
  lineItems: [{ businessDate, itemId, itemNameSnapshot, quantity, unitPricePaisa, totalPaisa }], // frozen snapshot
  consumptionTotalPaisa, previousDuePaisa, creditAppliedPaisa,
  totalPayablePaisa, paidPaisa, duePaisa,
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID',
  isVoided, voidedBy, voidedAt, voidReason,
  createdBy, createdAt, updatedAt
}
```
Indexes: `{billNumber}` unique, `{khataId,periodStart}`, `{bossId,periodStart}`,
`{khataId,status}`, partial unique `{khataId,bossId,periodStart,periodEnd}`
where `isVoided:false` (prevents double-billing a period).

### 3.9 Payment
```
{ _id, paymentCode, khataId, bossId, amountPaisa,
  method: 'CASH' | 'DIGITAL' | 'OTHER',
  digitalChannel: 'ESEWA' | 'KHALTI' | 'BANK' | 'QR' | null,
  paymentDate, receivedAt, reference, note,
  allocations: [{ billId, amountPaisa }],   // FIFO-applied
  unallocatedPaisa,                          // becomes credit
  isVoided, voidedBy, voidedAt, voidReason,
  createdBy, createdAt, updatedAt
}
```
Indexes: `{khataId,paymentDate}`, `{bossId,paymentDate}`, `{paymentDate}`,
`{method,paymentDate}`, `{'allocations.billId'}`.

### 3.10 Expense / ExpenseCategory
```
ExpenseCategory { _id, name (unique), isSystem, isActive, createdAt }
Expense { _id, categoryId, itemName, quantity, unit, amountPaisa, supplier,
  businessDate, receivedAt, paymentMethod: 'CASH'|'DIGITAL'|'OTHER',
  note, createdBy, createdAt, updatedAt }
```

### 3.11 InventoryItem + StockMovement (Phase-later)
```
InventoryItem { _id, name, unit, currentStock, minimumStock, costPricePaisa, isActive }
StockMovement { _id, inventoryItemId, type: 'PURCHASE'|'USAGE'|'ADJUSTMENT',
  quantity, unitCostPaisa, businessDate, expenseId?, note, createdBy }
```
Schema ships early so migration is trivial; endpoints ship later.

### 3.12 Counters — atomic sequences
```
{ _id: 'bill-2026', seq }
{ _id: 'khata', seq }
```
`findOneAndUpdate({_id}, {$inc:{seq:1}}, {upsert:true, new:true})` → atomic, no duplicates.

### 3.13 AuditLog
```
{ _id, adminId, adminNameSnapshot, action, entity, entityId,
  before: Mixed, after: Mixed, ip, userAgent, createdAt }
```
Indexes: `{entity,entityId,createdAt}`, `{adminId,createdAt}`, `{createdAt}`.

## 4. Relationship Map

```
Admin ──creates──► everything

Khata (INDIVIDUAL) ──┬──► ConsumptionTransaction ──► Item
                     ├──► DailyConsumption
                     ├──► Bill ──► Payment
                     └──► AuditLog

Khata (OFFICE) ──┬──► Boss ──┬──► Staff ──► ConsumptionTransaction
                 │           └──► Bill ──► Payment
                 ├──► ConsumptionTransaction (direct/office-level)
                 └──► Expense (canteen-wide, not tied to khata)

Item ──► InventoryItem ──► StockMovement
ExpenseCategory ──► Expense
```

## 5. Billing Logic

**Period computation** — given `khata.billingStartDay = 15` and today = 2026-09-20:
```
current period  = 2026-09-15 → 2026-10-14
previous period = 2026-08-15 → 2026-09-14
```
1. First period start = `max(periodStart, khata.startDate)` (§23, §78).
2. Last period end = `min(periodEnd, khata.endDate)` when closed.
3. `billingStartDay` validated 1..28 (days 29-31 don't exist every month).

**Generation algorithm (per billable entity):**
1. Guard: no non-voided bill exists for `(khataId, bossId, periodStart, periodEnd)`.
2. `consumption = Σ DailyConsumption.totalPaisa` where payer-key matches and `businessDate ∈ [periodStart, periodEnd]`.
3. `previousDue = Σ bill.duePaisa` where payer-key matches, `isVoided=false`, excluding this period's bill.
4. `credit = Σ payment.unallocatedPaisa` (payer-key).
5. `creditApplied = min(credit, consumption + previousDue)`.
6. `totalPayable = consumption + previousDue − creditApplied`.
7. `lineItems` = DailyConsumption rows grouped/formatted (date | item | qty | rate | amount).
8. `due = totalPayable` (`paidPaisa` starts at 0).
9. `status = totalPayable === 0 ? 'PAID' : 'UNPAID'`.
10. Write `Bill` + `AuditLog` in one Mongo transaction.

**Voiding & regeneration:** void the bill (reason required, audited) →
release its payment allocations back to `unallocatedPaisa` → regenerate with
a new bill number. The old bill is retained forever with `isVoided: true`;
the partial unique index excludes voided bills so regeneration is allowed.

## 6. Payment Logic

FIFO allocation across unpaid bills of the same payer-key, oldest period first:
```
recordPayment(amount, payerKey):
  remaining = amount
  for bill in unpaidBills(payerKey).sort(periodStart asc):
      applied = min(bill.duePaisa, remaining)
      bill.paidPaisa += applied; bill.duePaisa -= applied
      bill.status = recalcStatus(bill)
      allocations.push({ billId, amountPaisa: applied })
      remaining -= applied
      if remaining === 0: break
  unallocatedPaisa = remaining   // overpayment → credit
  // all writes in one Mongo transaction
```
Status: `paid===0 → UNPAID`; `due>0 → PARTIALLY_PAID`; `paid===totalPayable → PAID`;
`paid>totalPayable → OVERPAID` (shouldn't occur once credit logic is correct).
An unpaid/advance payment has `allocations: []`, `unallocatedPaisa: amount`,
auto-consumed as `creditAppliedPaisa` at the next bill generation.
Voiding a payment reverses its allocations and restores each bill's `duePaisa`.

## 7. Office / Boss / Staff Hierarchy

```
Khata(OFFICE) "ABC Company"
  ├── Boss "Ram"            → Staff: Sita, Hari, Gita
  ├── Boss "Shyam"          → Staff: Mina, Krishna
  └── Boss "Office Direct" (isDefault:true) → staff with no explicit boss
```
- Staff must belong to exactly one office khata and exactly one boss (auto-
  assigned to the office's default boss if none supplied).
- Moving staff between bosses updates `Staff.bossId` only — historical
  transactions keep their original `bossId`, so old and new billing groups
  both stay correct.
- A boss with active staff cannot be deactivated; staff must be moved first.
- Deactivating an office cascades status to its bosses/staff but never
  touches history.
- An OFFICE-scope bill is a consolidated statement listing each boss group's
  subtotal plus the office grand total — it does not replace per-group bills.

## 8. Consumption Aggregation Strategy

Requirement (§18/§77): Sita orders Tea×2, later Tea×1 → daily summary shows
Tea×3, not two rows.

**Write path (single Mongo transaction):**
```js
// 1. Append the immutable event
await ConsumptionTransaction.create([{ ..., quantity, unitPricePaisa, ... }], { session });

// 2. Upsert the read-model cell — concurrency-safe via the unique index
await DailyConsumption.updateOne(
  { consumerId, businessDate, itemId, unitPricePaisa },
  { $inc: { quantity, totalPaisa },
    $setOnInsert: { khataId, bossId, consumerType, consumerNameSnapshot,
                     consumerContextSnapshot, itemNameSnapshot, unitCostPaisa } },
  { upsert: true, session }
);
```
The unique index makes concurrent upserts atomic; including `unitPricePaisa`
in the key means a mid-day price change produces two lines instead of
corrupting one. Reversals write `quantity: -n` into the same cell plus a
`REVERSAL` transaction row; reads filter `quantity > 0` and a nightly job
cleans up zero-quantity cells.

## 9. Expense & Profit Calculation

Three clearly-labelled figures (§34, §60), never conflated:
```
① Accrual Sales (Revenue)  = Σ DailyConsumption.totalPaisa in period
② Collected (Cash flow)    = Σ Payment.amountPaisa in period (cash + digital, shown separately)
③ Outstanding Receivables  = Σ Bill.duePaisa (all non-voided bills)
```
Profit, with a data-completeness flag:
```
COGS          = Σ (unitCostPaisa × quantity) over DailyConsumption in period
costCoverage  = share of revenue whose item had a cost price
Gross Profit  = Revenue − COGS
Net Profit    = Gross Profit − Operating Expense (Σ Expense.amountPaisa)
Cash Surplus  = Revenue − Operating Expense   // always available, simplest view
```
The UI shows Gross Profit only when `costCoverage ≥ 95%`; otherwise it shows
an "Estimated" badge with the coverage percentage, per §34.

## 10. API Architecture

All routes under `/api`, JSON, cookie auth.

```
POST   /api/auth/login                rate-limited (5/15min/IP)
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/setup                first-run only, ADMIN_SETUP_TOKEN

GET    /api/khatas                    ?q&type&status&officeId&page&limit
POST   /api/khatas
GET    /api/khatas/:id
PATCH  /api/khatas/:id
PATCH  /api/khatas/:id/status         ACTIVE ↔ OFFLINE
POST   /api/khatas/:id/archive
GET    /api/khatas/:id/summary

GET    /api/offices/:khataId/bosses
POST   /api/offices/:khataId/bosses
PATCH  /api/bosses/:id
DELETE /api/bosses/:id                → deactivate
GET    /api/bosses/:id/summary

GET    /api/staff                     ?q&khataId&bossId&status
POST   /api/staff
PATCH  /api/staff/:id
PATCH  /api/staff/:id/transfer        { bossId }

GET    /api/items                     ?q&category&isActive
POST   /api/items
PATCH  /api/items/:id
DELETE /api/items/:id                 → soft (isActive:false)

GET    /api/customers/search          unified: individuals + bosses + staff

POST   /api/consumption
GET    /api/consumption               ?date&khataId&bossId&consumerId&itemId&page
POST   /api/consumption/:id/void      { reason }
GET    /api/consumption/daily         ?date&khataId&bossId

POST   /api/bills/generate            { khataId, bossId?, periodStart, periodEnd }
GET    /api/bills                     ?khataId&bossId&status&page
GET    /api/bills/:id
POST   /api/bills/:id/void            { reason }
GET    /api/bills/:id/print

POST   /api/payments
GET    /api/payments                  ?khataId&method&from&to&page
POST   /api/payments/:id/void         { reason }

GET    /api/expense-categories
POST   /api/expense-categories
GET    /api/expenses                  ?from&to&categoryId&page
POST   /api/expenses
PATCH  /api/expenses/:id
DELETE /api/expenses/:id

GET    /api/dashboard
GET    /api/reports/sales             ?from&to&groupBy=day|item|office
GET    /api/reports/expenses
GET    /api/reports/profit-loss
GET    /api/reports/outstanding
GET    /api/reports/customers
GET    /api/reports/items
GET    /api/reports/offices
GET    /api/reports/collections

GET    /api/audit-logs                ?entity&entityId&adminId&page
GET    /api/health
```

All of the above are implemented. In addition, these backward-compatible
aliases are mounted so older clients keep working:

```
GET    /api/dashboard                 → same handler as /api/dashboard/overview
GET    /api/dashboard/outstanding
GET    /api/offices/:khataId/bosses   → same as /api/bosses/offices/:khataId/bosses
GET    /api/bosses/:id                → same as /api/bosses/:id/summary
POST   /api/consumption/:id/void      → PATCH /api/consumption/:id/void
POST   /api/staff/:id/transfer        → PATCH /api/staff/:id/transfer
GET    /api/reports/audit-logs        → same as /api/audit-logs
```

**Middleware chain:**
```
helmet → cors(credentials) → cookieParser → rateLimit(login only)
       → json(bodyLimit) → mongoSanitize → requireAuth → requireRole('ADMIN')
       → validate(zodSchema) → controller → asyncHandler → errorHandler
```

## 11. Authentication Architecture

```
Login → verify bcrypt(12 rounds) → sign JWT { sub, role, jti }
      → Set-Cookie: token=<jwt>; HttpOnly; Secure(prod); SameSite=Lax; Path=/; Max-Age=7d
      → return admin profile
```
- No token in localStorage — cookie-only, `credentials:'include'` on every fetch.
- `SameSite=Lax` + an origin/referer check on non-GET requests → CSRF protection without a token library.
- `requireAuth` verifies the JWT AND loads the admin from DB, so a disabled admin is rejected immediately, not at token expiry.
- Next.js `proxy.ts` guards admin navigation (UX only — the API is the real gate).
- Login rate limit: 5 attempts / 15 min / IP, plus an email-keyed counter.
- First admin created via `POST /api/auth/setup`, gated by `ADMIN_SETUP_TOKEN`, self-disabling once an admin exists.

## 12. Frontend Folder Structure

See `README.md` §2 for the current tree; full component list is in the
original spec discussion and expands as each phase adds pages.

## 13. Edge Cases

| # | Case | Handling |
|---|---|---|
| E-1 | Same item tapped twice within milliseconds | Unique index + `$inc` upsert |
| E-2 | Price changes mid-day | `unitPricePaisa` in the unique key → two lines, both correct |
| E-3 | Customer joins mid-period | First bill `periodStart = max(periodStart, startDate)` |
| E-4 | Customer leaves mid-period | `endDate` clamps final period; khata → OFFLINE; history intact |
| E-5 | Staff moved between bosses | `Staff.bossId` changes; transactions keep historical `bossId` |
| E-6 | Staff moved between offices | Disallowed — deactivate + re-create; preserves both offices' history |
| E-7 | Offline customer attempted order | 409 `KHATA_OFFLINE`; search excludes them by default |
| E-8 | Overpayment | `unallocatedPaisa` → credit, auto-applied next bill |
| E-9 | Editing a transaction inside a finalized bill | 409 `BILL_FINALIZED`; UI offers "Void bill → correct → regenerate" |
| E-10 | Generating the same period twice | Partial unique index rejects it |
| E-11 | Duplicate name (Sita ×3) | Identity is ObjectId; UI always renders Name + context line |
| E-12 | Timezone | `businessDate` computed in Asia/Kathmandu at write time; never derived from UTC on read |
| E-13 | Month-end / leap year | `billingStartDay` capped at 28 |
| E-14 | Payment voided after allocations | Allocations reversed, bills restored, audit logged |
| E-15 | Bill with zero consumption | Allowed; produces a previousDue-only statement |
| E-16 | Item deactivated with history | Soft delete only; old bills unaffected |
| E-17 | Rounding | All arithmetic in integer paisa; division only for display |
| E-18 | Concurrent bill generation for same payer | Mongo transaction + unique index → one wins, other 409 |
| E-19 | Negative daily cell after reversal | Reads filter `quantity > 0`; nightly cleanup removes empties |
| E-20 | Boss deactivated with active staff | 409 — must transfer staff first |
| E-21 | Canteen buys stock but also has expenses | Expenses and inventory movements linked by optional `expenseId`; no double counting in P&L (P&L reads `Expense` only) |

## 14. Indexes Summary

```
Khata                  {khataCode}ᵘ  {type,status}  {searchName}
                       text(displayName,phone,khataCode)
Boss                   {khataId,status}  {khataId,isDefault}
Staff                  {khataId,status}  {bossId,status}  {searchName}
Item                   {searchName}  {category,isActive}
ConsumptionTransaction {khataId,businessDate}  {consumerId,businessDate}
                       {bossId,businessDate}   {itemId,businessDate}  {businessDate}
DailyConsumption       {consumerId,businessDate,itemId,unitPricePaisa}ᵘ
                       {khataId,businessDate}  {bossId,businessDate}  {businessDate}
Bill                   {billNumber}ᵘ  {khataId,periodStart}  {bossId,periodStart}
                       {khataId,status}  {khataId,bossId,periodStart,periodEnd}ᵖᵘ (isVoided:false)
Payment                {khataId,paymentDate}  {bossId,paymentDate}  {paymentDate}
                       {method,paymentDate}  {allocations.billId}
Expense                {businessDate}  {categoryId,businessDate}  {paymentMethod,businessDate}
AuditLog               {entity,entityId,createdAt}  {adminId,createdAt}  {createdAt}
```
Legend: ᵘ = unique, ᵖᵘ = partial unique.

## 15. Build Phases

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Repo scaffold, backend/ + frontend/, Mongo connection, error middleware, env config, `/api/health`, README | ✅ Done |
| 2 | Admin model, bcrypt, JWT cookie auth, login/logout/me, setup endpoint, rate limit, Next.js login page + proxy guard | ✅ Done |
| 3 | Khata/Boss/Staff models + CRUD + status transitions + Create Khata page + Khata Overview + detail shell | ✅ Done |
| 4 | Item CRUD, price management, snapshot strategy wired in | ✅ Done |
| 5 | Customer search API, Khaja Record page, ConsumptionTransaction + DailyConsumption, daily aggregation, void/reverse | ✅ Done |
| 6 | Bill generation, period math, line snapshot, print view, bill status | ✅ Done |
| 7 | Payments, FIFO allocation, partial/over/credit, void, payment history | ✅ Done |
| 8 | Expense categories + expenses + filters | ✅ Done |
| 9 | Dashboard cards, charts, reports | ✅ Done |
| 10 | Audit logs, pagination everywhere, seed script, Jest+Supertest tests | ✅ Done (seed script still pending) |
| 11 | Responsive pass: every screen at 375 / 768 / 1440 | ✅ Done |
| 12 | End-to-end scenario testing (§77-§83 walkthroughs) | ✅ Done (39 backend integration/regression tests) |

> **Implementation status:** The full backend API and all 12 admin pages are
> implemented and build clean. Backend: `npx tsc -p tsconfig.json --noEmit`
> passes and `npx jest --runInBand` is 39/39 green. Frontend: `npm run build`
> succeeds and `npx tsc --noEmit` passes. The only outstanding item from the
> phases above is a dedicated seed script (phase 10).

## 16. Decisions Approved Before Phase 1

1. Billable entity model — Khata as account root + `(khataId, bossId?)` as the payer key.
2. Transaction corrections are reversal-based (append `REVERSAL` rows), not in-place edits.
3. Bills freeze at generation; correcting a finalized period requires void + regenerate.
4. `DailyConsumption` grain = one doc per `(consumerId, businessDate, itemId, unitPricePaisa)`.
5. `billingStartDay` capped at 28 — no separate END_OF_MONTH anchor in v1.
6. Default "Office Direct" boss auto-created per office.
7. `unitCostPaisa` snapshotted onto every consumption row for real COGS (accuracy badge depends on cost prices being entered).
8. Seed data scaled up to ~2-3 months of transaction history (beyond the spec's bare minimum) so dashboard charts/reports have meaningful data.
