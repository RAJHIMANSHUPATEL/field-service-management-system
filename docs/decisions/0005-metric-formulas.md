# 0005 — Metric formulas

Status: accepted (Phase 11). Closes README §4 item 17.

All metrics are computed by one pure function (`analytics/analytics.formulas.ts`) from rows the API reads, so every screen uses the same numerator and denominator.

- **Period.** `[from, to)` in UTC, default the last 30 days. A job belongs to the period, and to the technician, of the visit that **completed** it.
- **Jobs completed.** Work orders completed in the period.
- **Jobs pending.** A snapshot (not period-bound): the technician's work orders in ASSIGNED, ACCEPTED, IN_PROGRESS, AWAITING_PARTS or FOLLOW_UP_REQUIRED.
- **First-visit resolution.** Completed jobs with exactly one visit that reached the site (has `arrivedAt`) ÷ completed jobs, as a whole percent. Cancelled visits that never arrived do not count as visits.
- **Repeat-visit jobs.** Completed jobs with more than one on-site visit (completed − first-visit).
- **Average service time.** Mean of `completedAt − startedAt` over completed visits in the period, in minutes.
- **Average completion time.** Mean of job completion − work order creation, in hours.
- **Customer rating.** Mean feedback rating over completed jobs in the period that were rated, with the count.
- **Cancelled visits.** Visit cancellations (`VisitChange` CANCELLED, including declines) in the period, by the technician who had the visit.
- **Parts consumed.** Units in CONSUMED ledger movements in the period on that technician's visits.
- **Dashboard** (live): active jobs as above; delayed visits are scheduled visits not started 30 minutes after their start (the same rule as the "job delayed" notification); the unassigned queue is OPEN work orders plus requests awaiting triage; pending invoices are ISSUED + OVERDUE with the outstanding balance (total − paid), drafts listed separately.
