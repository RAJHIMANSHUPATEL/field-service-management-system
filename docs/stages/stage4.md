# Stage 4 — Schedule the visit and accept the job

Status: complete.

Admin or ops set one date and time on an assigned work order. The assigned technician accepts that visit or declines the job. Skills, calendars, workload scoring, rescheduling, and on-site steps stay out.

## Decisions

- Accepting a request still creates an `OPEN` work order. Assigning it still makes it `ASSIGNED`. Scheduling does not change that status.
- A visit is `SCHEDULED` or `CANCELLED`. `scheduledStart` is stored in UTC. The preferred date window is not checked.
- Only one `SCHEDULED` visit may exist. A second schedule returns `409` with `INVALID_TRANSITION`.
- The visit copies the technician who is assigned at schedule time. The work order stays `ASSIGNED` until the technician accepts.
- Accept is limited to that technician and requires the scheduled visit. The work order becomes `ACCEPTED`. The visit stays `SCHEDULED`. The service request stays `ACCEPTED`.
- Decline is limited to that technician while the work order is `ASSIGNED`, and it requires a reason. The reason is a `WorkOrderNote`. Any scheduled visit becomes `CANCELLED`. The technician is cleared and the work order returns to `OPEN`.
- Assign stays available for `OPEN` and `ASSIGNED` until a scheduled visit exists. After that, and after `ACCEPTED`, assign returns `409`.
- The customer still cannot open work orders. Admin and ops get a link from the accepted request to the work order.
- The Scheduling page in the sidebar stays unbuilt. Scheduling is a dialog on the work order.

## Completed

- `WorkOrderStatus` includes `ACCEPTED`. `ServiceVisit` and `WorkOrderNote` are in the schema. Migration `20260930110333_schedule_visit_and_accept` is applied.
- `POST /api/v1/work-orders/:id/schedule` is limited to admin and ops. Accept and decline are limited to the assigned technician.
- API tests cover schedule then accept with the request still `ACCEPTED`, accept with no visit, decline with and without a visit, a second schedule, and assign while a visit is scheduled.
- Admin and ops schedule from the work order. The technician accepts or declines from the same page. The list labels an accepted job as Accepted.

## Left for later stages

Skills, service areas, workload scoring, a calendar, rescheduling, and on-site steps stay out.
