# Stage 16 — Contracts and preventive maintenance

Completes Phase 10.

## Decisions

- **Contracts** keep their period, covered assets and coverage percentages (stage 14) and now have `includedVisits` (blank = unlimited) and `usedVisits`.
  - A visit is used when a job is **completed** and its invoice was priced with contract coverage. That records one `ContractVisit` per work order (unique), so a job with a follow-up visit uses one included visit, and repricing never counts twice.
  - Once the included visits are used up, the contract no longer covers new jobs (coverage falls back to none); the job that used the last visit keeps its coverage if its draft is repriced.
  - Renewal alerts are the "contract approaching expiration" notification from stage 15 (30 days before `endsOn`).
- **Maintenance plans** (`/maintenance-plans`): asset, service type, optional contract (must cover the asset), name, `intervalDays`, `leadDays`, `nextDueOn`, active or paused.
  - A plan is due when `now ≥ nextDueOn − leadDays`. The API checks due plans when it starts and every `MAINTENANCE_SWEEP_MS` (default 15 minutes); office staff can also run the check (`POST /maintenance-plans/run`).
  - A due plan opens an `ACCEPTED` service request (preferred window from the due date) and an `OPEN` work order linked by `maintenancePlanId`, with no human action. The plan row is locked while generating, and a plan with a job still open does not generate another.
  - A plan whose contract is cancelled or ends before the due date does not generate.
  - Completing the generated job sets `nextDueOn` to the completion day plus the interval: the next occurrence is scheduled from when the work was actually done.
  - `pause` and `resume` are the only plan state changes; repeating one is `409 INVALID_TRANSITION`.
  - Customers can read their own plans and contracts; technicians cannot.

## Completed

- Migration `add_contract_visits_and_maintenance_plans`.
- Module `maintenance` (schema, transitions, service, routes); contract and invoice pricing changes; completion hook in `visit.service.ts`.
- Tests: `maintenance/maintenance.test.ts` (due rule, generation once, next occurrence, visit counter and exhaustion, pause and resume, contract ended, roles, org scope, validation).
- Web: Contracts and maintenance page (contracts with visits used and left, plans with next due and latest job, create both, pause, run now); the work order shows its plan.
- E2E: `maintenance.spec.ts` creates the contract and plan in the UI, waits for the API timer to open the job by itself, completes it, and sees "1 of 2 used" and the next due date moved by the interval.
