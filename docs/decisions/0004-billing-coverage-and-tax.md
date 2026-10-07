# 0004 — Who pays, and how tax is computed

Status: accepted (Phase 8)

Coverage is decided when the invoice is priced, from the job's completion date: warranty on the asset first (fully covered), else the active service contract covering the asset (per-category percentages), else nothing. Coverage is stored per invoice line (`coveredAmount`), so the customer and office see exactly what was absorbed and by whom.

Tax applies after coverage and discount, at the organisation's rate, split into equal CGST and SGST halves (intra-state). Lines carry an optional SAC code from the service type. IGST for inter-state supply needs a place-of-supply on the customer address and is deferred.

The invoice is a draft until ops issues it; drafts always reprice from source data so a late contract or warranty correction is picked up, and issued invoices never change.
