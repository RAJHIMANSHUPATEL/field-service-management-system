# Stage 5 — Start the accepted job

Status: complete.

The assigned technician starts an accepted job from the work order page. The visit goes en route, then arrived, then in progress. Diagnosis, notes, photos, signature, completion, and the customer view of each step stay out.

## Decisions

- A visit is `SCHEDULED`, `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS`, or `CANCELLED`. A work order adds `IN_PROGRESS`.
- Each step is its own endpoint: `POST /api/v1/visits/:id/en-route`, `/arrive`, and `/start`. The transition map is in `visit.transitions.ts` beside the visit schema.
- Steps run in order: `SCHEDULED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS`. A skipped, repeated, or backward step returns `409` with `INVALID_TRANSITION`.
- Steps need the work order to be `ACCEPTED`. A scheduled visit on a job that is only `ASSIGNED`, and a `CANCELLED` visit, return `409`.
- Only the technician on the visit may move it. Another technician, admin, ops, and the customer get `403`.
- En route and arrived leave the work order `ACCEPTED`. Start makes the work order `IN_PROGRESS`. The service request stays `ACCEPTED`.
- Each step returns the work order, so the page refreshes from one response.
- No `AuditEvent` model exists yet, so no audit rows are written. That matches the earlier stages.
- The technician gets one large button on the work order page: On my way, I've arrived, then Start job. The page is laid out for 375px first.

## Completed

- Migration `20261007120000_add_visit_start_statuses` adds the new enum values.
- The visits module has routes, a controller, a Zod param schema, a service, and the transition map.
- API tests cover the full path, skipped and repeated steps, another technician, admin, ops, the customer, a visit on a job that is not accepted, a cancelled visit, and an unknown visit.
- `frontend/src/lib/status.ts` and `features/workOrders/schemas/workOrder.schema.ts` mirror the status enums and steps. The list and detail pages label the new statuses.

## Left for later stages

Diagnosis, work performed, notes, photos, signature, completion, unsuccessful visits, the customer view of each step, a My jobs view, and idempotency keys stay out.
