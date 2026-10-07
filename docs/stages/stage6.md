# Stage 6 — Foundations: one-command stack, CI, and the lifecycle test

Status: complete.

Closes the Phase 0 gaps that later phases depend on: a compose file for Postgres, Redis and MinIO, a one-command dev start, CI on every push, request logging, and a Playwright lifecycle test that grows with each phase.

## Decisions

- `docker-compose.yml` runs Postgres 17, Redis 7 and MinIO. `scripts/dev.sh` starts compose when Docker exists, then installs, migrates, seeds and starts both apps. Without Docker it uses services already running on the machine.
- `.github/workflows/ci.yml` (branch `feat/phase0-ci`, waiting on a token with the `workflow` scope) runs backend lint (`tsc --noEmit`), build and tests against a Postgres service, frontend lint and build, then the Playwright test.
- The frontend keeps oxlint. The backend lint is the TypeScript check. A shared `.prettierrc.json` sets formatting.
- Requests are logged as one JSON line each (method, path, status, ms, user). Logging is off under tests.
- Leftover debug calls to a local ingest URL were removed from the error handler, the Prisma client and login.
- After a page load the web client restores the access token from the refresh cookie before its first call, so a signed-in reload no longer sends a request that fails with `401`.
- End-to-end tests live in `e2e/` with their own `package.json`. They are not a shared package. The lifecycle test watches the console and the network after sign-in and fails on any error or failed API call.

## Completed

- `e2e/tests/lifecycle.spec.ts` covers request, triage, assign, schedule, accept, en route, arrive and start. The technician steps run at 375px, and a screenshot is saved to `/workspace/screens/`.
- Compose and the dev script are in the repo. CI is ready on `feat/phase0-ci` but not pushed, because the token lacks the `workflow` scope.

## Left for later stages

ESLint on the backend, a production Dockerfile, and log shipping stay out.
