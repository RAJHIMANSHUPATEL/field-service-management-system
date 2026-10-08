# Demo dataset

A realistic Indian demo dataset for walkthroughs and screenshots. It is separate from the base
seed (`npm run db:seed`), which the tests and the e2e suite depend on and which is unchanged.

## Run it

Bring the stack up as for development (`./scripts/dev.sh`, or Postgres, Redis and the S3
emulator running with `backend/.env` filled in), then:

```bash
cd backend
npm run db:migrate          # if the database is new
npm run db:seed:demo
```

The run takes about 75 seconds and prints record counts at the end. Set `DEMO_VERBOSE=1` to see
the API's own logs.

- **Separate organization.** Everything lives in **Kaveri Facility Services Pvt Ltd**. The base
  seed's organization and users are left alone.
- **Idempotent.** Each run deletes the demo organization (children first, following the live
  foreign-key graph) and builds it again. The run stops before touching anything if a demo email
  already belongs to another organization.
- **Deterministic.** A fixed random seed (`DEMO_SEED`, default `20261008`) drives every choice.
  Dates are relative to an anchor day (`DEMO_ANCHOR=YYYY-MM-DD`, default today in IST), so the
  data always covers the last ~85 days and the next two weeks. With a fixed `DEMO_ANCHOR` two runs
  produce identical counts. Without it, "now" is the real time, so visits around the current hour
  show as en route, on site or in progress.

## How it is built

The seed does not write domain rows directly. It starts the real Express app in-process
(`createApp()` from `src/app.ts`) and replays about 2,400 timed actions through the HTTP API, as
the user who would perform them (admin, ops, technician or customer), in time order. A simulated
clock replaces `Date` while it runs, so audit events, notifications, Prisma timestamps, invoice
due dates and overdue detection all carry the replayed times. Status transitions, stock
reservation and consumption, invoice numbering, GST, contract visit counts and maintenance
schedules all go through the normal service rules. Notifications use the inline queue and the
log mail and SMS providers, so no real email or SMS is sent.

## Logins

Every demo account uses the base seed's demo password, **`Password123!`**.

| Role | Email | Lands on |
|---|---|---|
| Admin | `meera.iyer@example.com` | Dashboard, users, audit log, everything ops sees |
| Ops (Bengaluru, Hyderabad) | `rohan.mehta@example.com` | Dashboard, requests, work orders, scheduling, invoices |
| Ops (Mumbai, Pune) | `priya.nair@example.com` | Same, for the western cities |
| Technician (Bengaluru) | `suresh.kumar@example.com` | My jobs: a job in progress now, more this week |
| Technician (Mumbai) | `vikram.patil@example.com` | My jobs: on site now |
| Technician (Pune) | `rohit.jadhav@example.com` | My jobs: en route now |
| Customer (apartment, Bengaluru) | `ananya.rao@example.com` | Greenwood Heights: lifts, DG set, pumps, AMC |
| Customer (hospital, Bengaluru) | `kavitha.menon@example.com` | Sanjeevani Multispeciality Hospital |
| Customer (home, Bengaluru) | `vivek.rao@example.com` | Ananya & Vivek Rao |
| Customer (office, Pune) | `nikhil.joshi@example.com` | Infinity IT Park — Tower 3 |

The other technicians are `manjunath.gowda`, `imran.pasha`, `deepa.shetty`, `sachin.pawar`,
`anil.gaikwad`, `ganesh.more`, `ravi.teja` and `abdul.rahman` (all `@example.com`). Every customer's
primary contact can sign in as `firstname.lastname@example.com` (see `backend/prisma/demo/data.ts`).

All names, addresses and companies are fictional. Emails use `example.com` and phone numbers use
Indian formats from fake ranges.

## What it contains

Counts from a run on 8 Oct 2026 (they move slightly with the anchor day):

| Entity | Count |
|---|---|
| Customers (homes, apartments, hospitals, offices, restaurants, shops) | 35, in Bengaluru, Mumbai, Pune and Hyderabad |
| Contacts / addresses | 41 / 35, pincodes inside the six service areas |
| Assets | 118, with install dates and warranties, some expired |
| Technicians | 11, with skills, service areas, vans and 5 time-off entries |
| Users | 49 (1 admin, 2 ops, 11 technicians, 35 customer contacts) |
| Parts / warehouses / stock movements | 20 / 15 (4 city stores, 11 vans) / ~600 |
| Service requests | ~210: submitted, needs info, rejected, accepted |
| Work orders | ~190: open, assigned, accepted, in progress, awaiting parts, follow-up required, completed |
| Visits | ~200 including cancelled, unsuccessful, en route, arrived, in progress; ~210 visit changes (reschedules, reassignments, declines) |
| Part requests | ~15, open and fulfilled |
| Invoices | ~130: draft, issued, partially paid, overdue, paid and void, at 18% GST: CGST + SGST for Bengaluru (Karnataka, the GST state) and IGST for Mumbai, Pune and Hyderabad |
| Payments | ~50 (UPI, bank transfer, card, cash, online) |
| AMC contracts / contract visits / maintenance plans | 9 (one cancelled) / ~43 / 23 |
| Feedback | ~70 ratings, most with comments |
| Notifications / audit events / photos | ~4,300 / ~4,450 / ~45 |

This week's calendar is full (around eight visits a day), and dashboards and technician
performance show non-zero numbers for the 7, 30 and 90 day windows.

## Screenshots

With the backend (`npm run dev`) and frontend (`npm run dev -- --port 5173`) running:

```bash
cd e2e
npx playwright test -c demo.config.ts
```

This signs in as ops, admin, a technician at 375 px wide and a customer, and saves PNGs to
`/workspace/screens/demo/` (override with `DEMO_SCREENS_DIR`). Any console error, page error or
failed API call fails the run. It is not part of the regular e2e suite.
