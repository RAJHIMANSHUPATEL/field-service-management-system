# Stage 15 — Feedback and notifications

Completes Phase 9.

## Decisions

- **Catalogue and rules.** `notifications/notification.catalog.ts` lists the 22 events of requirements section 17 with audience (customer, technician, operations), default channels and wording (`{{placeholders}}`).
  - Each organisation gets the catalogue as `NotificationRule` rows the first time an event fires or an admin opens the rules. Admins can switch an event off or change its channels and wording (`PATCH /notifications/rules/:id`); code only says which event happened.
  - Recipients: the customer's linked contacts; the job's technician (or, for "assignment changed", the previous one); every ADMIN and OPS user for operations events.
- **Deliveries.** One `Notification` row per recipient and channel, written after the business transaction commits (`notify()` logs, never turns a committed change into an error).
  - The row is queued on BullMQ (`notifications` queue on Redis, `REDIS_URL`) and delivered by a worker started with the API: 5 attempts, exponential backoff from 2 s. Each attempt records `attempts` and `lastError`; after the last one the row is `FAILED`. Office staff can retry a failed delivery (`POST /notifications/deliveries/:id/retry`; anything else is `409 INVALID_TRANSITION`).
  - `NOTIFICATION_QUEUE=inline` (default under tests) runs the same handler and retry policy in-process; `drainNotifications()` waits for it.
  - Channels: in-app (the row is the message), email through `lib/mailer.ts`, SMS through the new local `lib/sms.ts` (`SMS_PROVIDER=log|file|fail`). People with no phone number get no SMS rows.
- **Inspectable.** `GET /notifications` is the signed-in user's in-app inbox with an unread count, `POST /notifications/:id/read` marks one read (once). `GET /notifications/deliveries` (office) shows every delivery with channel, status, attempts and error; the web app has a bell in the header and a Notifications page with the log and, for admins, the rules.
- **Time-based events.** `runSweeps()` fires "job delayed" (a scheduled visit 30 minutes past its start and not started) and "contract approaching expiration" (active contract ending within 30 days). It runs every 5 minutes in the API process and on `POST /notifications/sweep`. A `dedupeKey` makes each fire once per visit or contract.
- **Low inventory.** Parts have `reorderLevel` (0 = off). After a transfer out, adjustment or reservation, if available stock at that location is at or below it, operations are told once; a later receipt, transfer in or return re-arms the alert.
- **Feedback.** The customer rates a `COMPLETED` job once (`POST /work-orders/:id/feedback`: rating 1–5, satisfied yes/no, optional comment). Before completion it is `409 INVALID_TRANSITION`; a second rating is `409 FEEDBACK_EXISTS`. `GET /feedback` (office) lists ratings with count, average and percentage satisfied; the feedback also shows on the request and work order.

## Completed

- Migrations `add_feedback_and_notifications`, `notification_and_feedback_updated_at`, `drop_backfill_defaults`.
- Modules: notifications (catalog, service, events, routes), feedback; `lib/queue.ts`, `lib/sms.ts`.
- Tests: `notifications/notifications.test.ts` (catalogue, every audience along a job, SMS retry to FAILED and manual retry, declines, reassignment, reschedule, cancel, follow-up, parts, low stock, sweeps, inbox, rules, feedback, roles and org scope).
- Web: notification bell, Notifications page (deliveries, rules), Customer feedback page, rating card on the customer's completed request, low-stock level on parts.
- E2E: the lifecycle spec checks the customer's bell, rates the job, sees it in feedback and checks the email deliveries reached `SENT` through the BullMQ worker.

## Open questions

- Real email and SMS providers, and per-user notification preferences, are left for deployment.
