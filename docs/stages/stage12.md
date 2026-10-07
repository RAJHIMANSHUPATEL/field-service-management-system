# Stage 12 — Parts and inventory: stock by location, van stock, reservation, consumption, ledger

Completes Phase 6.

## Decisions

- `StockLevel` keeps `onHand` and `reserved` for each location and part. Available is `onHand − reserved`. On-hand and reserved can never go negative, and reserved can never exceed on-hand. A move that would break this returns `409 INSUFFICIENT_STOCK` with the current numbers.
- `StockMovement` is an append-only ledger. Each row has a kind (RECEIVED, TRANSFER_OUT/IN, RESERVED, RELEASED, CONSUMED, RETURNED, ADJUSTED), signed on-hand and reserved deltas, a required reason, an actor, and a visit link where one applies. Every stock change goes through `applyMovement`, which locks the level row (`SELECT … FOR UPDATE`). See [ADR 0003](../decisions/0003-stock-ledger.md).
- Office endpoints (admin, ops):
  - `POST /inventory/receipts`
  - `POST /inventory/transfers`: two rows sharing a `transferGroup`
  - `POST /inventory/adjustments`: signed, non-zero
- Read endpoints:
  - `GET /inventory/stock` and `GET /inventory/movements`
  - Technicians see only their own van.
- Visit parts (`VisitPart`, transition map in `inventory/visitPart.transitions.ts`):
  - `POST /visits/:id/parts`: reserve at diagnosis, while ARRIVED or IN_PROGRESS. Takes the technician's van by default, or a given `warehouseId`.
  - `/consume`: RESERVED → CONSUMED, IN_PROGRESS only. On-hand and reserved both go down.
  - `/release`: RESERVED → RELEASED.
  - `/return`: CONSUMED → RETURNED, with a reason; on-hand goes back up.
  - Any other move returns `409 INVALID_TRANSITION`.
  - Only the visit's technician may use these endpoints.
- Completing a visit releases its unused reservations automatically and writes RELEASED ledger rows.
- A visit part keeps the catalogue unit price and currency from when it was added. Phase 8 invoices from it.
- Assumptions (README §4.13): parts are counted in bulk. `isSerialized` is stored but serial numbers are not tracked yet. Defective returns use RETURNED with a reason. Procurement requests come in Phase 7.

## Completed

- Migration `add_stock_levels_ledger_and_visit_parts`.
- The inventory module: ledger, service, visit parts, routes. Tests in `inventory/inventory.test.ts` cover the rule units, the van decrement with its ledger rows, auto-release, return, overdraw and adjust, validation, the technician scope, roles, and other orgs.
- Web:
  - `/inventory`: stock table, receive/transfer/adjust dialogs and the ledger.
  - The technician's on-site panel can reserve a part from the van, use it, release it, or return it.
- The lifecycle e2e:
  - Ops receives stock and transfers some to Tara's van.
  - The technician reserves a filter at diagnosis and uses it after the job starts.
  - Ops sees the van drop by one, and a ledger row with the reason and the technician's name.

## Left for later stages

Part requests when stock runs out (Phase 7), low-stock alerts (Phase 9), serial numbers.
