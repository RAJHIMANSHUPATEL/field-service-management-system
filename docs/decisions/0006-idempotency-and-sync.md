# 0006 — Idempotency keys and delta sync for the mobile client

**Status:** accepted (Phase 12)

**Context.** Technicians work with poor signal. A queued POST can be sent twice, and a full reload
of jobs on every app start is slow.

**Decision.** POSTs accept an `Idempotency-Key`, stored in Postgres (not Redis) so a replay survives
restarts and runs in the same database as the action. Keys are scoped per user, hashed with the
body, kept 24 h; 5xx results are not stored. Sync is a read-only delta endpoint keyed on
`updatedAt` of work orders and visits, with a server-issued cursor; writes reuse the normal
state-change POSTs instead of a separate sync-write protocol.

**Consequences.** One extra row per keyed POST (swept by expiry). Clients must keep the key with
the queued request. Deletions are not in the delta; nothing in the technician scope is hard-deleted
today, and cancellations arrive as status changes.
