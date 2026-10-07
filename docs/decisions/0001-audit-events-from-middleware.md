# 0001 — Audit events are written by middleware

Status: accepted (stage 7).

## Context

Phase 1 needs an `AuditEvent` on every mutation. There are many mutation endpoints, and new ones are added in every phase. Writing the event in each service is easy to forget.

## Decision

`backend/src/middleware/audit.ts` is mounted on `/api/v1`. For every successful `POST`, `PATCH`, `PUT` or `DELETE`, it writes one event before the response is sent. The event records the organization, the actor, an action derived from the route (`work-orders.assign`, `customers.update`), the entity type and id, method, path, and status. Failed requests and reads are not recorded. Public flows (login, logout, invitation accept, password reset) name their actor through `res.locals.auditActor`.

## Consequences

- New endpoints are audited without extra code. Tests check the actions they rely on.
- The event is written after the business change, not in the same transaction. A crash between the two could lose one event. This is accepted for now. If later work needs stronger guarantees, services can write richer events in their own transactions.
- Before and after values are not stored yet.
