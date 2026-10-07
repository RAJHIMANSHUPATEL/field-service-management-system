# 0002 — Scheduling conflicts and technician scoring

Status: accepted (Phase 4)

Conflicts are hard errors (`409 SCHEDULE_CONFLICT`) checked in one place (`visits/visit.scheduling.ts`) for schedule, reschedule and reassign. Overlap uses `[start, start + durationMinutes)` against the technician's non-terminal visits and time off.

Scoring is a transparent sum shown to dispatchers: skill 40, area 30, workload up to 30. It is advice only; any active technician may be assigned. Weights can change later without a migration.

Every plan change is stored as a `VisitChange` row so visit history survives beyond the generic audit log.
