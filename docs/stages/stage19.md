# Stage 19 — Demo dataset

**Status:** Complete.

## Goal
Make the portal presentable with realistic data for every role, without touching the base seed
that the tests and e2e suite rely on.

## Delivered
- **`npm run db:seed:demo`** (backend) builds the organization *Kaveri Facility Services Pvt Ltd*:
  35 fictional customers across Bengaluru, Mumbai, Pune and Hyderabad, 118 assets, 11 technicians
  with vans, skills, areas and time off, parts and city stores, about 190 work orders over the last
  ~85 days and the next two weeks, invoices in every state with GST, payments, AMC contracts,
  maintenance plans, feedback and notifications. Logins and counts are in [demo.md](../demo.md).
- **Replay through the API.** The seed runs `createApp()` in-process and performs each action over
  HTTP as the acting user, under a simulated clock. Statuses, audit events, the stock ledger,
  invoice numbers and totals, contract visit counts and maintenance schedules therefore follow the
  same rules as real use. No domain rows are inserted directly.
- **Deterministic and idempotent.** Fixed RNG seed (`DEMO_SEED`), anchor day (`DEMO_ANCHOR`). Each
  run deletes the demo organization along the live foreign-key graph and rebuilds it. Every
  status the board shows is guaranteed: recent jobs are forced into awaiting parts (with open part
  requests) and follow-up, and live visits are placed en route, on site and in progress at "now".
- **Invoices** now show a *Partially paid* badge on issued and overdue invoices with payments.
- **Screenshot walk**: `e2e/demo.config.ts` signs in as ops, admin, a technician at 375 px and a
  customer, saves PNGs and fails on console errors, page errors or failed API calls.

## Supporting changes
- `src/app.ts` holds `createApp()`; `src/server.ts` keeps the listener and timers. Tests and the
  demo seed import the app without starting either.
- `accessTokenFor(userId)` lets trusted scripts act as a user without a password round trip.
- `setStorageClockOffset()` keeps S3 request signing on real time while `Date` is simulated.
- `npm run lint` also type-checks `prisma/demo`.

## Checks
Backend lint, build and the full test suite, frontend lint and build, migrate, base seed, e2e and
the restore drill (`/workspace/check-strict.sh`). Two runs with `DEMO_ANCHOR=2026-10-08` printed
identical counts. The screenshot walk passed with no console or network errors.
