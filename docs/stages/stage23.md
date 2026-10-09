# Stage 23 — SMTP email provider

**Status:** Complete.

## Goal
Let the existing mailer send real email when an SMTP server is configured, without changing any
caller of `sendMail`. No new channel or notification event.

## Delivered
- **`MAIL_PROVIDER=smtp`** in `backend/src/lib/mailer.ts`, using `nodemailer` (plus `@types/nodemailer`).
  - Settings from the environment: `SMTP_HOST`, `SMTP_PORT` (parsed as a number; anything that is not
    a port counts as missing), `SMTP_USER`, `SMTP_PASS`.
  - TLS: `secure` is true on port 465, otherwise STARTTLS; `SMTP_SECURE=true|false` overrides it.
  - Sender: `MAIL_FROM`, default `FieldOps <no-reply@example.com>`.
  - The message keeps the subject and text; a link that is not already in the text is appended.
  - The transporter is created on the first send and cached (rebuilt only if the settings change).
  - Missing settings: the message is logged exactly as the `log` provider does and nothing throws.
    One warning, at the first such message, names the missing variables; values (above all
    `SMTP_PASS`) are never logged.
  - A failed send throws. The notification worker already records `attempts` and `lastError` and
    retries up to 5 times before `FAILED`.
  - `sentMail` records a message once the transport accepted it (or when it was logged instead).
  - `log` and `file` are unchanged, and tests keep `log`.
- **Test hook:** `setMailTransportFactory(factory | null)` swaps the nodemailer factory for a fake and
  resets the cache and the warning.
- **Config:** `backend/.env.example` documents the commented SMTP variables with placeholders. Its
  `DATABASE_URL` had a real-looking password; it is now `<your-postgres-password>` (local `.env`
  files untouched).
- **Docs:** [deployment](../deployment.md#email) explains switching providers; stage 15 links to it.

## Tests
`src/lib/mailer.test.ts` → "mailer: SMTP provider" (fake transport, never a real server):
- hands the message to the SMTP transport, created once and reused
- reads the port as a number and uses TLS on 465 unless SMTP_SECURE says otherwise
- falls back to logging when SMTP settings are missing, warning once without the password
- rethrows a failed SMTP send and does not record it as sent
- leaves the log and file providers as they were

`src/modules/notifications/notifications.test.ts`:
- retries a failed SMTP send through the worker until it is accepted or marked FAILED (two failures
  then `SENT` after 3 attempts; always failing gives `FAILED`, 5 attempts, `lastError` kept)

Both throw-related tests fail if the SMTP error is swallowed (checked by mutation).

## Not done
No SMTP account is configured or contacted. HTML email, attachments, bounce handling, and SMS or
WhatsApp gateways are out of scope.
