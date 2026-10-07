# Stage 3 — Assign the work order

Status: complete.

Admin or ops assigns an active technician to an open work order. That technician can see the job. The technician does not accept or decline it. Skills, calendars, workload scoring, and the visit stay out.

## Decisions

- Accepting a request still creates a work order with status `OPEN` and no technician. Assignment is a separate step.
- `ASSIGNED` is the only new work order status. `technicianId` is empty while the status is `OPEN` and set when the status is `ASSIGNED`.
- Assigning an `OPEN` work order sets `ASSIGNED` and the technician. Assigning again while it is `ASSIGNED` replaces the technician and stays `ASSIGNED`. Any other status returns `409` with `INVALID_TRANSITION`.
- The technician must belong to the same organization and be active. A missing technician is `404` `TECHNICIAN_NOT_FOUND`. An inactive technician is `400` `TECHNICIAN_INACTIVE`.
- A technician can list and read only work orders assigned to their profile. Another technician's job in the same organization is `403`. A customer still cannot list work orders.
- The assignment is not written onto the service request. The customer still only sees the request as `ACCEPTED`.
- The technician does not accept, decline, schedule, or start the job. The detail is read-only for them.
- The seed stays one submitted request. The demo path is accept, then assign.

## Completed

- `WorkOrderStatus` includes `ASSIGNED`, and `WorkOrder` has an optional technician. Migration `20260929152243_assign_work_orders` is applied.
- `POST /api/v1/work-orders/:id/assign` is limited to admin and ops. Work order list and read also allow a technician, scoped to their own jobs.
- API tests cover ops assigning a job the technician can list, another technician receiving `403`, an inactive technician being rejected, a second assign replacing the technician, and a customer blocked from the list.
- Admin and ops open a work order from the list and assign an active technician in a dialog. Below the tablet breakpoint the list is stacked rows; wider screens keep the table.
- The technician sidebar has Jobs, and their home opens that list. Profile stays beside it.

## Left for later stages

Skills, service areas, workload scoring, calendars, technician accept or decline, visits, and scheduling stay out.
