# Stage 11 — Technician execution: on-site work to completion

Completes Phase 5. Builds on stage 5 (en route, arrive, start).

## Decisions

- Visit and work order gain `COMPLETED`. `POST /visits/:id/complete` moves the visit `IN_PROGRESS` → `COMPLETED` and the work order `IN_PROGRESS` → `COMPLETED`. Anything else returns `409 INVALID_TRANSITION`.
- Completion needs the work performed and a customer signature. Without them it returns `409 INVALID_TRANSITION` with `details.missing` (`workPerformed`, `signature`).
- Each step stamps its time on the visit (`enRouteAt`, `arrivedAt`, `startedAt`, `completedAt`, `signedAt`, all UTC). The customer view is built from those stamps.
- `PATCH /visits/:id/report` (diagnosis, work performed) and `POST /visits/:id/photos` (raw jpeg/png/webp, up to 10 MB, `X-File-Name`, optional `X-Caption`) work while the visit is `ARRIVED` or `IN_PROGRESS`. Only the visit's technician may use them; anyone else gets 403.
- `POST /visits/:id/signature` takes `{ signerName, image }`, where the image is a PNG data URL from the on-screen pad. It works only while `IN_PROGRESS`. The PNG is stored in object storage. The JSON body limit was raised to 3 MB to fit it.
- Photos and the signature are read through short-lived presigned URLs (`GET /visits/:id/photos/:photoId`, `GET /visits/:id/signature`). Org staff, the visit's technician and the job's customer may read them.
- `POST /work-orders/:id/notes`: admin, ops, or the assigned technician.
- The customer sees each step on the request page: on the way, arrived, work started, signed, completed, plus the diagnosis, the work performed, photos and the signer.
- Technicians land on `/my-jobs`: in progress, upcoming, completed, soonest visit first. The page is laid out for 375px first.
- Assumption (README §4): the technician captures the customer's signature on the technician's device. There is no customer-side sign-off.

## Completed

- Migration `add_visit_execution_report_photos_signature` (new statuses, step timestamps, report fields, signature, `VisitPhoto`).
- API: complete, report, photos, signature, notes. Tests in `visits/execution.test.ts` cover the full path, the missing prerequisites, wrong steps, a finished visit, validation, other technicians, admin, ops, the customer, and unknown ids. Fixtures are shared in `src/test/jobFixtures.ts`.
- Web: on-site panel (diagnosis, work performed, photo with camera capture, signature pad, Complete job), visit progress, add a note, My jobs, and the customer job progress.
- The lifecycle e2e now runs request → triage → assign → schedule → reschedule → accept → en route → arrive → diagnosis + photo → start → work + note → signature → complete, checking the customer view after each step. Screenshots are taken at 375px.

## Left for later stages

Parts used (Phase 6), unsuccessful visits and follow-ups (Phase 7), the service report PDF (Phase 8), offline mode.
