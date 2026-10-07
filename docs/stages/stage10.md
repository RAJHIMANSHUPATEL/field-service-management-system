# Stage 10 — Assignment and scheduling: planning, history, calendar, time off

Completes Phase 4.

## Decisions

- A visit lasts `durationMinutes` (default 120). A technician cannot hold two overlapping SCHEDULED/active visits or a visit during time off: `409 SCHEDULE_CONFLICT` with `details.kind` `VISIT` or `TIME_OFF` (README §4.6 assumption: hard block, no override).
- Only a SCHEDULED visit can be rescheduled or cancelled (`canReplan`); otherwise `409 INVALID_TRANSITION`. Each change needs a reason and writes a `VisitChange` row (SCHEDULED, RESCHEDULED, REASSIGNED, CANCELLED) plus the audit event.
- Cancelling a visit returns an ACCEPTED work order to ASSIGNED so it can be scheduled again.
- Reassign (`POST /work-orders/:id/reassign`) works from ASSIGNED or ACCEPTED, returns the job to ASSIGNED for the new technician and moves any scheduled visit.
- Candidate score out of 100 (README §4.9 assumption): required skill 40, service area covers the site postal code 30, workload `max(0, 30 − 10 × open jobs)`. Availability at the requested time is reported, not scored. See [ADR 0002](../decisions/0002-scheduling-rules-and-scoring.md).
- Calendar `GET /visits?from&to&technicianId` is limited to 62 days; technicians only see their own visits and time off.

## Completed

- Migration `add_visit_history_time_off_and_required_skill` (VisitChange, TechnicianTimeOff, ServiceVisit.durationMinutes, ServiceType.requiredSkillId).
- Endpoints: visits reschedule/cancel, calendar, work order candidates and reassign, technician time off (list, add, delete).
- Web: reschedule/cancel/reassign dialogs with visit history, suggested technicians in the assign dialog, `/schedule` week calendar with time off (technicians see "My schedule").
- Tests: `visits/scheduling.test.ts` (legal and illegal paths, conflicts, roles, org scope); e2e lifecycle reschedules with history; `scheduling.spec.ts` adds time off and checks the technician view at 375px.

## Left for later stages

- Drag-and-drop calendar, route optimisation, overriding conflicts.
