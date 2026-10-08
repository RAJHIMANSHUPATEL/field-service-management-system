# Stage 20 — IGST for inter-state supply

**Status:** Complete.

## Goal
Charge IGST instead of CGST + SGST when the job site is in a different state from the company's GST
registration, without changing the rate, coverage, discount or total. Decision record: ADR
[0004](../decisions/0004-billing-coverage-and-tax.md).

## Delivered
- **Data:** migration `add_org_gst_state_and_igst` adds `Organization.gstState` (nullable two-digit
  GST state code) and `Invoice.igst` (`Decimal(12,2)`, default 0; existing invoices keep CGST/SGST).
- **State lookup** (`src/lib/gstStates.ts`): codes, abbreviations and names of all states and UTs,
  case-insensitive, with common alternates.
- **Pricing:** `priceInvoice` takes `supply: "INTRA_STATE" | "INTER_STATE"`; the service derives it
  from the organisation's state and the work order address. Same state: CGST = SGST = half, IGST 0.
  Other state: IGST = the same two rounded halves, CGST = SGST = 0.
- **Refusals:** `409 ORG_GST_STATE_REQUIRED` and `422 SITE_STATE_UNRECOGNISED` (see
  [api.md](../api.md)). Completion, draft edits and issue all price, so all three are refused.
- **Issue reprices the draft** one last time, so a site state corrected after completion flips the
  supply type of what is issued. Issued, paid, overdue and void invoices never change.
- **Organisation settings API:** `GET /api/v1/organization` (admin, ops), `PATCH /api/v1/organization`
  (admin; `gstState` accepts code, abbreviation or name; audited as `organization.update`),
  `GET /api/v1/organization/gst-states`.
- **Frontend:** Master data → Company card with the GST state (admins edit, ops read; a red badge
  when unset). The invoice detail shows only the tax components that apply: CGST and SGST, or IGST.
- **Seeds:** the base seed's organisation is in Karnataka (29) with its site in Bengaluru, so its
  invoices are intra-state. The demo organisation (Bengaluru head office) is set to Karnataka through
  the API, so Bengaluru jobs show CGST + SGST and Mumbai, Pune and Hyderabad jobs show IGST. The
  demo seed stays deterministic.

## Tests
`billing.test.ts`: "charges the same tax as IGST on an inter-state supply, keeping the total";
"GST supply type" — intra-state, inter-state, the draft that flips when the site state changes before
issue (and is frozen after), never repricing issued/paid/overdue/void invoices, and the two refusals
(including a blocked completion). `organization.test.ts`: the state lookup, admin update by code,
abbreviation or name with audit, validation, and the role checks.

## Not done
Credit notes, an invoice PDF, the customer's GSTIN and reverse charge.
