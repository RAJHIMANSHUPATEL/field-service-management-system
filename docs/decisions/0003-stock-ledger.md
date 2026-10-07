# 0003 — Stock as levels plus an append-only ledger

Status: accepted (Phase 6)

Stock is held as one row per (location, part) with on-hand and reserved counts, and every change appends a `StockMovement` with signed deltas, a reason, and an actor. The level row is the fast answer to "how many are available"; the ledger is the audit trail and can rebuild the levels (sum of deltas per location and part).

All changes go through one function that locks the level row inside the transaction and enforces `0 ≤ reserved ≤ onHand`, so concurrent reservations cannot oversell. Ledger rows are never updated or deleted; corrections are new ADJUSTED rows.
