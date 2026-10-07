# Stage 13 — Incomplete jobs and follow-up

Completes Phase 7.

## Decisions

- Visit gains `UNSUCCESSFUL`. Work order gains `AWAITING_PARTS` and `FOLLOW_UP_REQUIRED`. Both keep the job open; the service request stays `ACCEPTED`.
- `POST /visits/:id/unsuccessful { outcome, reason, partRequests[] }` is for the visit's technician while the visit is `ARRIVED` or `IN_PROGRESS`.
  - The visit becomes `UNSUCCESSFUL`, with `endedAt` and `outcomeReason`.
  - The work order moves from `ACCEPTED`/`IN_PROGRESS` to the outcome status.
  - Unused part reservations are released, and a work order note records the reason.
  - `AWAITING_PARTS` must name at least one part.
  - Any other step returns `409 INVALID_TRANSITION`.
- Part requests (`PartRequest`, OPEN → FULFILLED | CANCELLED, map in `partRequests/partRequest.transitions.ts`):
  - Endpoints: `GET /part-requests`, `POST /part-requests/:id/fulfil` and `/cancel`. Admin and ops only.
  - Once the last open request on an `AWAITING_PARTS` job is resolved, the job moves to `FOLLOW_UP_REQUIRED`.
- Visit two: `POST /work-orders/:id/schedule` now also accepts `FOLLOW_UP_REQUIRED` (map in `workOrders/workOrder.transitions.ts`).
  - It creates the next visit for the same technician and returns the job to `ASSIGNED`. The technician accepts the new time as before; then the usual steps lead to `COMPLETED`.
  - Scheduling while `AWAITING_PARTS` returns 409.
- Assumptions (README §4.13): fulfilling a request records that the part was sourced. Stock is received through `/inventory/receipts` as a separate step. There is no supplier or purchase-order model yet.

## Completed

- Migration `add_unsuccessful_visits_follow_up_and_part_requests`.
- `visits/followUp.test.ts` covers:
  - the full visit-one-unsuccessful to visit-two-completed path
  - follow-up from arrival with reservations released
  - early and repeated outcomes, validation, wrong actors
  - part request resolve and cancel paths
- Web:
  - "Can't finish today" dialog on the technician's on-site panel.
  - Part requests with Mark fulfilled and Cancel for ops.
  - Schedule for follow-up jobs.
  - A Waiting group under My jobs.
  - The customer sees the outcome reason and both visits.
- e2e `follow-up.spec.ts`. Visit one ends awaiting parts at 375px; the customer sees the job still open; ops fulfils the request and schedules visit two; the technician completes it.

## Left for later stages

Procurement and suppliers, notifying the customer of the follow-up (Phase 9).
