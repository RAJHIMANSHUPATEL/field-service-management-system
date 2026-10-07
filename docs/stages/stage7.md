# Stage 7 — Identity and access: audit, invitations, password reset, permission matrix

Status: complete.

Closes Phase 1. Every mutation writes an `AuditEvent`. Admins invite staff, and invitees set their own password. Anyone can reset a forgotten password by email. The permission matrix is written down and tested for all four roles.

## Decisions

- Audit events come from middleware on `/api/v1`. See [ADR 0001](../decisions/0001-audit-events-from-middleware.md). Admins read them at `GET /api/v1/audit-events`, filtered by `entityType` and `entityId`.
- Invitations are for `ADMIN` and `OPS`. Technicians are still created on the Technicians page and customer logins from customer contacts. An invitation is `PENDING`, then `ACCEPTED` or `REVOKED`. The transition map is in `invitation.transitions.ts`. Accepting or revoking a closed invitation returns `409 INVALID_TRANSITION`.
- Invitation links last 7 days and reset links 1 hour. Tokens are stored only as SHA-256 hashes.
- A password reset request always answers `202`, so it does not reveal which accounts exist. Confirming a reset revokes every refresh token for that user. A used link returns `409 INVALID_TRANSITION`. An unknown or expired link returns `400 TOKEN_INVALID`.
- Mail is local only. `MAIL_PROVIDER=log` prints the message, and `MAIL_PROVIDER=file` also appends it to `MAIL_OUTBOX_FILE`. The e2e tests read that file. To add a real provider, add a branch in `backend/src/lib/mailer.ts`.
- Users and Audit log are admin only in the API, the routes, and the sidebar.
- Refresh token rotation with reuse detection was already in place from stage 1.

## Completed

- Migration `add_audit_reset_and_invitations` adds `AuditEvent`, `PasswordResetToken`, `Invitation` and `InvitationStatus`.
- `docs/permissions.md` is the matrix. `permissions.test.ts` signs in all four roles and checks each read and some writes.
- API tests cover invitation accept, re-accept, revoke, revoke twice, a bad token, a duplicate email, a non-staff role, non-admin callers, and another organization. They cover password reset once, reuse, and an unknown email. Audit tests cover what is recorded, what is skipped, admin-only access, and organization scoping.
- Web pages: Users and roles (list, invite, revoke), Audit log, Forgot password, Reset password, and Accept invitation. `e2e/tests/access.spec.ts` walks invite, join, reset and the audit log in a browser.

## Left for later stages

Deactivating users, changing a user's role, before and after values in audit events, and a real mail provider stay out.
