# Field Service Management System

A platform for companies that install, repair, maintain, and inspect equipment at customer
locations. It covers the whole service lifecycle: customer request, operations triage, work
order, technician assignment, scheduled visit, on-site work, parts consumption, completion,
invoicing, payment, and feedback.

Functional requirements live in
[`field_service_management_system_requirements.md`](./field_service_management_system_requirements.md).
This document is the **execution plan**: the stack, the architecture, the delivery phases, the
conventions we hold to, and the decisions still open.

---

## 1. Product intent

This is built as a **real product** a service company could run daily, not a demo. That drives
three non-negotiables from day one:

1. **API-first.** The web app is the first client, a technician mobile app is the second. The
   API never assumes a browser.
2. **Auditable.** Every status change and money-affecting action is recorded with actor,
   timestamp, and reason. Field service disputes are settled with history.
3. **Field-realistic.** Technicians work in basements and parking lots. Weak connectivity,
   photo uploads, and stale data are design inputs, not edge cases.

The MVP is web-only. Mobile follows once the core lifecycle is stable.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript across API and web |
| API | Node.js + Express |
| Database | PostgreSQL |
| ORM / migrations | Prisma |
| Web | React (Vite) + React Router |
| UI | Tailwind CSS + shadcn/ui |
| Server state | TanStack Query |
| Forms / validation | React Hook Form + Zod (schemas mirrored from the API contract) |
| Auth | JWT access token + rotating refresh token, argon2 password hashing |
| Files | S3-compatible object storage, presigned uploads |
| Background jobs | BullMQ + Redis (notifications, maintenance due, contract expiry) |
| Tests | Vitest (unit), Supertest (API), Playwright (critical flows) |
| Local infra | Docker Compose for PostgreSQL, Redis, and MinIO |

### Repository layout

The API and the web app are separate repositories. This workspace holds both while they are
scaffolded, plus the planning docs.

```text
fieldServiceManagementSystem/
├── backend/                          # its own git repository
│   ├── src/
│   │   ├── modules/                  # one folder per domain
│   │   │   └── workOrders/
│   │   │       ├── workOrder.routes.ts
│   │   │       ├── workOrder.controller.ts
│   │   │       ├── workOrder.service.ts       # business rules, transitions, Prisma queries
│   │   │       └── workOrder.schema.ts        # Zod request/response + transitions
│   │   ├── middleware/               # auth, rbac, error handler, request logging
│   │   ├── lib/                      # prisma client, storage, mailer, queue
│   │   └── server.ts
│   └── prisma/
│       ├── schema.prisma
│       ├── migrations/
│       └── seed.ts
└── frontend/                         # its own git repository
    └── src/
        ├── features/                 # one folder per product area, mirrors API modules
        │   └── workOrders/
        │       ├── api/
        │       ├── components/
        │       ├── hooks/
        │       ├── pages/
        │       └── schemas/
        ├── components/               # shared UI; components/ui is shadcn only
        ├── lib/                      # api client, auth, formatting, status enums
        └── routes/
```

There is no shared package. The API contract is the boundary: paths, bodies, status enums, and
error codes. Change the API first, then mirror the change in `frontend/src/lib/status.ts` and
the feature schema.

Rules of the layout: **HTTP never touches Prisma directly** (controller calls the service, and the
service runs the Prisma queries). Status enums and allowed transitions live beside the owning
module's schema, and services reject illegal jumps.

---

## 3. Domain model

Core entities and the relationships that matter:

```text
Organization (the service company; tenant boundary)
 ├── User ──── Role                      (OPS, TECHNICIAN, ADMIN, CUSTOMER_CONTACT)
 ├── Customer
 │    ├── CustomerContact                (many people per business customer)
 │    ├── Address                        (many service locations)
 │    ├── Asset                          (equipment, lives at an Address)
 │    ├── ServiceContract ── ContractAsset
 │    └── Invoice ── InvoiceLine ── Payment
 ├── ServiceRequest  ──> WorkOrder
 ├── WorkOrder
 │    ├── ServiceVisit                   (one or many per work order)
 │    │    ├── VisitPartUsage
 │    │    ├── VisitAttachment
 │    │    └── CustomerSignature
 │    ├── Diagnosis
 │    └── ServiceReport
 ├── Technician ── TechnicianSkill ── Skill
 │    └── ServiceAreaAssignment ── ServiceArea
 ├── Part ── StockLevel(location) ── StockMovement(reason, actor)
 ├── Warehouse / TechnicianStock
 ├── MaintenancePlan ── MaintenanceOccurrence
 ├── Feedback
 ├── Notification
 └── AuditEvent
```

Two modelling decisions worth stating up front, because the requirements blur them:

- **Work order status and visit status are separate.** A work order is `ASSIGNED`,
  `IN_PROGRESS`, `AWAITING_PARTS`, `COMPLETED`. A visit is `SCHEDULED`, `EN_ROUTE`, `ARRIVED`,
  `IN_PROGRESS`, `COMPLETED`, `UNSUCCESSFUL`. `EN_ROUTE` belongs to a visit, not to the job.
- **Rescheduling creates history, never overwrites.** A reschedule cancels the old visit with a
  reason and creates a new one linked to the same work order.

### Canonical statuses

```text
ServiceRequest   NEW → TRIAGED → CONVERTED | REJECTED | INFO_REQUESTED → TRIAGED
WorkOrder        DRAFT → ASSIGNED → ACCEPTED → IN_PROGRESS → COMPLETED
                         ↘ REJECTED → ASSIGNED (reassign)
                         IN_PROGRESS → AWAITING_PARTS | FOLLOW_UP_REQUIRED → IN_PROGRESS
                         any → CANCELLED (with reason)
ServiceVisit     SCHEDULED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED
                         ↘ UNSUCCESSFUL (reason) | CANCELLED | RESCHEDULED | MISSED
Invoice          DRAFT → ISSUED → PARTIALLY_PAID → PAID
                         ISSUED → OVERDUE | VOID | CANCELLED
```

Transitions are enforced in one place per entity (a transition map beside that module's schema),
and services reject illegal jumps. No controller sets a status field by hand.

---

## 4. Requirement gaps to close

The requirements describe the happy path well. These are the holes that will cause rework if we
start coding without answering them. Nothing here contradicts the spec; it fills in what a
production build needs.

### Blocking — needed before the schema is written

1. **Tenancy.** One deployment per service company, or multi-tenant SaaS? This decides whether
   `organizationId` is on every table and in every query. Assumed multi-tenant below.
2. **Who pays.** When a job runs under warranty or an AMC, the invoice should be zero or
   partial. We need the rule that decides billable vs covered, evaluated at completion time.
3. **Tax model.** The spec shows a single "Tax ₹333" line. Indian GST needs CGST/SGST/IGST
   splits, an HSN/SAC code per line, and place-of-supply. Cheap to model now, painful later.
4. **Customer identity.** Do customers self-register, or does operations create the login? For
   business customers like "ABC Apartments", multiple contacts need access with different
   permissions.
5. **Permission matrix.** Roles are listed but not the per-action permissions. A technician
   must not read another technician's jobs; ops must not edit a paid invoice.

### Important — needed before the matching phase

6. **Scheduling rules.** Working hours, holidays, visit duration, time-window granularity,
   travel buffer, daily capacity, and whether double-booking is blocked or merely warned.
7. **SLA and priority.** "Priority" and "delayed jobs" are referenced with no definitions.
   Each priority needs a response and resolution target, plus escalation when breached.
8. **Service areas.** Geography by pincode, city, or drawn polygon? Pincode lists are the
   pragmatic start.
9. **Assignment scoring.** "Consider skills, availability, area, workload" needs to become a
   deterministic, explainable score, with manual override always available.
10. **Location and consent.** `EN_ROUTE` and `ARRIVED` imply GPS. Decide whether arrival is
    geofence-verified or self-declared, and get explicit technician consent for tracking.

### Important — operational correctness

11. **Offline behaviour.** Which technician actions must work with no signal, and how conflicts
    resolve on sync. Even if v1 is online-only, the API should accept client-supplied
    idempotency keys and client timestamps so we do not redesign later.
12. **Concurrency.** Two dispatchers assigning the same work order, or a technician completing a
    job ops just cancelled. Needs optimistic locking on work orders and visits.
13. **Parts depth.** Serialized vs bulk parts, reservation on diagnosis, defective-part return,
    van stock counts, and the procurement request that the "part unavailable" flow depends on.
14. **Photo requirements.** Mandatory before/after photos per service type, file size and count
    limits, and retention.
15. **Signature weight.** What the customer is attesting to, and whether name plus OTP
    accompanies the drawn signature.
16. **Notification channels.** Email, SMS, WhatsApp, push, or in-app per event; plus templates,
    quiet hours, opt-out, and retry on delivery failure. The event list is long enough that it
    should be table-driven, not hardcoded.
17. **Metric formulas.** "First visit resolution 89%" and "average service time" need exact
    numerators and denominators, or dashboards will disagree with each other.
18. **Money edge cases.** Invoice void, credit note, partial payment, refund on cancellation,
    and cancellation fees.
19. **Asset lifecycle.** Decommissioning, moving equipment between addresses, and transfer to a
    new owner.
20. **Non-functional targets.** Timezone handling (store UTC, render local), currency, i18n
    readiness, PII handling and retention, backup and restore expectations.

### Editorial

21. **Pick one term per concept.** The spec uses Asset/Equipment and Service Visit/Appointment
    interchangeably. We standardise on **Asset** and **Service Visit** in code and UI.
22. **Status naming.** "CONVERTED TO WORK ORDER" is an outcome, not a status; the canonical
    enums in section 3 replace the prose variants.

---

## 5. Delivery phases

Each phase ends with something usable and demoable. No phase depends on a later one.

### Phase 0 — Foundations
Separate `backend/` and `frontend/` projects, TypeScript config, ESLint/Prettier, Docker Compose (Postgres, Redis, MinIO), Prisma
wired up, Express skeleton with a typed error handler and request logging, React app shell, CI
running lint, typecheck, and tests on every push.
**Done when** a developer clones the repo, runs one command, and reaches a working login page
against a seeded database.

### Phase 1 — Identity and access
Organization, User, Role, permission matrix, JWT plus refresh rotation, password reset, user
invitations, `AuditEvent` written on every mutation, and route guards on both sides.
**Done when** all four roles can log in and each sees only what their role permits.

### Phase 2 — Master data
Customers, contacts, addresses, assets with warranty, service types, skills, technicians,
service areas, parts catalogue, warehouses. Admin CRUD screens plus a realistic seed script.
**Done when** an admin can set up a whole company from an empty database.

### Phase 3 — Request to work order
Customer creates a request with asset, location, description, preferred window, attachments.
Operations queue with triage: accept, reject, request info, set priority and service type, then
convert to a work order.
**Done when** a customer-submitted request becomes a work order and both sides see consistent
status.

### Phase 4 — Assignment and scheduling
Technician availability, calendar view, assignment with skill/area/workload scoring, accept and
reject with reason, reassignment, visit scheduling, reschedule and cancel with full history.
**Done when** a work order reaches `ACCEPTED` with a `SCHEDULED` visit, and a reschedule leaves
an auditable trail.

### Phase 5 — Technician execution
Mobile-first "My jobs" view, en route, arrival, start service, diagnosis, work performed, notes,
photo upload, customer signature, completion.
**Done when** a technician drives a job from `SCHEDULED` to `COMPLETED` on a phone-sized screen
and the customer sees each step.

### Phase 6 — Parts and inventory
Stock by location, transfers to technician van stock, reservation at diagnosis, consumption at
the visit, returns, adjustments, and a movement ledger where every row has a reason and an actor.
**Done when** using a part during a visit decrements the correct stock and shows in the ledger.

### Phase 7 — Incomplete jobs and follow-up
Unsuccessful visit with reason, `AWAITING_PARTS` and `FOLLOW_UP_REQUIRED`, part request when out
of stock, and scheduling visit two against the same work order.
**Done when** a job that cannot finish on visit one completes on visit two, with the work order
staying open in between.

### Phase 8 — Service report, invoice, payment
Report generated from visit data and downloadable as PDF. Invoice built from service charge,
labour, and parts, with warranty and contract coverage applied, tax, discounts, then issue,
record payment, and overdue detection.
**Done when** a completed job produces a correct invoice that reaches `PAID`, and a
contract-covered job produces the covered amount instead.

### Phase 9 — Feedback and notifications
Post-service rating and comments, table-driven notification rules across the event list in the
requirements, delivered by background workers with retry.
**Done when** every event in requirements section 17 fires to the right audience and is
inspectable.

### Phase 10 — Contracts and preventive maintenance
Contracts with period, covered assets, included and consumed visits, renewal alerts. Maintenance
plans that generate a request when due and schedule the next occurrence on completion.
**Done when** a due maintenance plan produces a work order without human action and the contract
visit counter decrements.

### Phase 11 — Analytics
Operations dashboard (active jobs, delays, unassigned queue, pending invoices) and technician
performance using the formulas agreed in section 4.
**Done when** the numbers reconcile against raw data in a spot check.

### Phase 12 — Hardening and mobile readiness
Performance passes on list endpoints, security review, rate limiting, backup and restore drill,
API documentation, idempotency and sync groundwork for the mobile client, deployment.
**Done when** the API is documented and stable enough for a React Native client to be built
against it without changes.

---

## 6. Conventions

### Database and Prisma
- `cuid()` string primary keys; both sides of every relation declared with `@relation`.
- Every model carries `createdAt @default(now())` and `updatedAt @updatedAt`.
- `@@index` on every foreign key and on the fields we filter by: status, scheduled date,
  assigned technician, organization.
- `@@unique` on real-world identities: serial number per organization, invoice number per
  organization, part SKU per organization.
- Money as `Decimal @db.Decimal(12, 2)`. Never floats. Store the currency code.
- All timestamps stored UTC.
- Soft-delete only where history demands it (customers, assets, parts); hard-delete elsewhere.
- One migration per logical change, named for intent: `npx prisma migrate dev --name add_visit_outcome`.
- Migrations are never edited after being pushed. Fix forward with a new migration.

### API
- Routes are `/api/v1/<resource>`, plural and kebab-case.
- Zod validates every request body, query, and param at the edge; the inferred type is the only
  type the service trusts.
- Services call Prisma directly. Controllers do not.
- Errors return a consistent shape: `{ error: { code, message, details? } }`, with `code` a
  stable machine-readable string.
- Lists are paginated by default with `?page` and `?limit`, and return `{ data, meta }`.
- State changes are their own endpoints, not `PATCH status`: `POST /work-orders/:id/assign`,
  `POST /visits/:id/arrive`. The verb documents the rule.
- Mutations that a flaky mobile connection may retry accept an `Idempotency-Key` header.

### Frontend
- One folder per feature, mirroring the API modules.
- TanStack Query owns server state; React state is for UI only.
- Zod schemas in each feature mirror the API contract so client and server validation stay aligned.
- Technician screens are designed at 375px first, one primary action per screen, thumb-reachable.

### Testing
- Services with branching business rules (transitions, pricing, coverage, stock) get unit tests.
- Every state-change endpoint gets an API test for both the legal path and the illegal one.
- Playwright covers the lifecycle: request → triage → assign → visit → complete → invoice → pay.
- Any bug fix starts with a failing test.

### Git
- Conventional commits: `feat(work-orders): add assignment scoring`.
- Branches as `feat/…`, `fix/…`, `chore/…`; small PRs, reviewed against the phase's done criteria.
- Significant choices get an ADR in `docs/decisions/` rather than a paragraph in a PR comment.

---

## 7. Immediate next steps

1. Answer the five blocking questions in section 4.
2. Scaffold Phase 0 and confirm one command brings the whole stack up.
3. Write `schema.prisma` for Phases 1 and 2, review it as a whole before the first migration.
4. Write `docs/state-machines.md` as the single source of truth for statuses and transitions.
5. Build Phase 3 end to end, thin but complete, to validate the module pattern before it is
   repeated eleven times.

---

## 8. Status

Stages 1, 2, 3, and 4 are complete. The records of decisions and finished work are
[`docs/stages/stage1.md`](./docs/stages/stage1.md),
[`docs/stages/stage2.md`](./docs/stages/stage2.md),
[`docs/stages/stage3.md`](./docs/stages/stage3.md), and
[`docs/stages/stage4.md`](./docs/stages/stage4.md). Later stages are listed in
[`docs/stages/README.md`](./docs/stages/README.md).

The phases below are the long-term sequence. Stage 1 covers a slice of phases 0, 1, and 2.
Stage 2 covers the request and unassigned work order slice of phase 3. Stage 3 covers
assigning that work order, a slice of phase 4. Stage 4 schedules one visit and records the
technician's accept or decline, still a slice of phase 4. Stages 6–18 complete phases 0–12; see the table and [`docs/PROGRESS.md`](./docs/PROGRESS.md).

| Phase | State |
|---|---|
| 0 — Foundations | Complete (stage 6); GitHub Actions CI runs the full check set on every push |
| 1 — Identity and access | Complete (stage 7) |
| 2 — Master data | Complete (stage 8) |
| 3 — Request to work order | Complete (stage 9) |
| 4 — Assignment and scheduling | Complete (stage 10) |
| 5 — Technician execution | Complete (stages 5 and 11) |
| 6 — Parts and inventory | Complete (stage 12) |
| 7 — Incomplete jobs and follow-up | Complete (stage 13) |
| 8 — Report, invoice, payment | Complete (stage 14) |
| 9 — Feedback and notifications | Complete (stage 15) |
| 10 — Contracts and maintenance | Complete (stage 16) |
| 11 — Analytics | Complete (stage 17) |
| 12 — Hardening and mobile readiness | Complete (stage 18); deployment documented for local use only, not deployed |
