# 0004 — Who pays, and how tax is computed

Status: accepted (Phase 8); amended 2026-10-08 for inter-state supply (IGST)

Coverage is decided when the invoice is priced, from the job's completion date: warranty on the asset first (fully covered), else the active service contract covering the asset (per-category percentages), else nothing. Coverage is stored per invoice line (`coveredAmount`), so the customer and office see exactly what was absorbed and by whom.

Tax applies after coverage and discount, at the organisation's rate (`taxRatePercent`). Lines carry an optional SAC code from the service type.

## Intra- and inter-state supply

The place of supply is the job site: the work order's address. The supplier's state is the
organisation's GST registration state (`Organization.gstState`, a two-digit GST state code such as
`29` Karnataka, `27` Maharashtra, `36` Telangana).

- **Same state (intra-state):** equal CGST and SGST halves, IGST stored as 0.
- **Different state (inter-state):** the full tax is stored as IGST, CGST and SGST are 0.

The amount of tax does not depend on the supply type. It is always computed as before: half the
rate on the taxable amount, rounded to the paisa (half up), twice. IGST is that sum, so it equals
CGST + SGST exactly and switching supply type never changes the tax total or the invoice total
(18% of ₹1.03 rounded once would be ₹0.19; the two halves give ₹0.18, and IGST is ₹0.18). Rate,
coverage and discount are unaffected. `Invoice.igst` was added with default 0, so invoices priced
before this change keep their CGST and SGST and read as intra-state.

**Normalising states.** `Address.state` is free text, so both sides go through one lookup of the 36
states and union territories plus "Other Territory" (`backend/src/lib/gstStates.ts`). It accepts the
two-digit code (a single digit is padded), the usual abbreviation (with common alternates: TS/TG,
OD/OR, CG/CT) or the name, case-insensitively, with `&` read as "and" and punctuation ignored
("Jammu & Kashmir", "orissa", "Pondicherry"). Daman and Diu (old code 25) and Dadra and Nagar Haveli
resolve to the merged code 26. The organisation stores the code; the API's Zod schema rejects a
value that does not resolve (400 `VALIDATION_ERROR`).

**Missing or unknown states are refused, not guessed.** A wrong split is a compliance error that
cannot be fixed by editing a draft later, so pricing stops instead:
- no organisation GST state → `409 ORG_GST_STATE_REQUIRED` (a precondition on the organisation, like
  other 409s). The column is nullable so existing and newly registered organisations can exist
  without it; an admin sets it under Master data → Company (`PATCH /api/v1/organization`).
- a site state that does not resolve → `422 SITE_STATE_UNRECOGNISED` with `addressId` and `state` in
  `details`; the office corrects the customer address.

Pricing happens when a visit completes (the draft is written in the completion transaction), when
ops edit a draft, and at issue. So until the GST state is set, a technician's completion is refused
too and the visit stays in progress; nothing is lost and the same request succeeds once corrected.
Blocking completion was preferred over writing a draft with a guessed split or none at all.

## Drafts reprice; issued invoices are frozen

Drafts are priced from source data whenever they are written: at completion, on every edit (discount,
notes, extra lines) and — added with this amendment — one last time when ops issue them, inside the
issue transaction. Before this, issue used the stored draft totals, so a site address corrected after
completion (a different state) would only be picked up if someone happened to edit the draft. Reading
a draft does not reprice it; the issued invoice is what counts. From `ISSUED` on (paid, overdue, void)
an invoice is never repriced: edits and re-issue answer 409, and address, contract or warranty changes
do not touch it.

Out of scope: credit notes, an invoice PDF, the customer's GSTIN, and reverse charge.
