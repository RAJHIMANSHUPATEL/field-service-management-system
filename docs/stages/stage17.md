# Stage 17 — Analytics

Completes Phase 11.

## Decisions

- Formulas are in [ADR 0005](../decisions/0005-metric-formulas.md) and in one pure function, `analytics/analytics.formulas.ts`, unit-tested on its own.
- `GET /analytics/dashboard` (office): active jobs by status, delayed visits (with the list), unassigned queue (with the list and requests awaiting triage), pending invoices (count, overdue, drafts, outstanding), visits today, completed jobs.
- `GET /analytics/technicians?from&to` (office): per technician and for the team: jobs completed, pending, first-visit resolution, repeat-visit jobs, average service and completion time, rating, cancelled visits, parts consumed.
- Both are computed live from the operational tables; at this scale no rollup tables are needed. They can be added later behind the same endpoints.

## Completed

- Module `analytics` (formulas, service, routes); no migration.
- Tests: `analytics/analytics.test.ts` builds a known scenario (one first-visit fix, one repeat, ratings, a pending late visit, a cancelled visit, an unassigned job, issued and draft invoices) and reconciles every number with counts taken directly from the tables; outside the period nothing counts; office only; org scope.
- Web: the ops Dashboard (home page) and the Analytics page (7/30/90 days).
- E2E: the lifecycle spec compares the dashboard's pending invoices with the invoice list and Tara's completed jobs on the Analytics page with the API.
