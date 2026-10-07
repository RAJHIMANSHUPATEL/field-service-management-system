# Stage 9 — Request to work order: attachments and full triage

Status: complete.

Closes Phase 3. The customer attaches photos or PDFs to a request. Triage can set both priority and service type when it accepts. The customer's request page shows the job status and each visit, so both sides see the same state.

## Decisions

- Files go to S3-compatible storage through `backend/src/lib/storage.ts`. Locally that is MinIO (docker-compose) or any S3 emulator on `S3_ENDPOINT`. Keys are `<org>/requests/<request>/<uuid>`.
- An upload is `POST /service-requests/:id/attachments` with the raw file as the body. `Content-Type` gives the type, and `X-File-Name` the URL-encoded name. JPEG, PNG, WebP and PDF are allowed, up to 10 MB each. Larger files return `413 FILE_TOO_LARGE`. A rejected request takes no files and returns `409 INVALID_TRANSITION`. This answers README section 4.14 with the simplest limits for now.
- A download is `GET /service-requests/:id/attachments/:attachmentId`. It returns a presigned URL that is valid for 5 minutes, so the object store is never public.
- The same people who can read the request can attach to it and open its files: the owning customer, admin and ops.
- `POST /service-requests/:id/accept` takes an optional `serviceTypeId`. The service type must be active and in the same organization. The work order copies the final priority and service type.
- The request response carries the work order's status and visits. The customer sees "Job status" and each visit's time and status.

## Completed

- Migration `add_request_attachments` adds `ServiceRequestAttachment`.
- API tests cover upload and download round-trip, a wrong type, an empty file, an oversize file, another customer, a rejected request, accept with a new service type and priority, an unknown service type, and a second accept.
- The web request page lists attachments, opens them, and uploads new ones. The accept dialog has a service type select. The lifecycle e2e test attaches a photo as the customer, opens it as ops, and checks the customer's view of the job.

## Left for later stages

Virus scanning, thumbnails, deleting attachments, and retention rules stay out.
