# Stage 21 — Downloadable invoice PDF

**Status:** Complete.

## Goal
Let the office and the customer download an issued invoice as a PDF, built the same way as the
service report and from the stored invoice, never by repricing.

## Delivered
- **Endpoint:** `GET /api/v1/invoices/:id/pdf` → `200 application/pdf`,
  `Content-Disposition: inline; filename="invoice-<number>.pdf"`. Same pattern as
  `GET /work-orders/:id/report` (pdfkit, A4, the whole document buffered and then sent).
- **Statuses:** `ISSUED`, `OVERDUE`, `PAID` and `VOID`. There is no separate partially paid status:
  that is `ISSUED` or `OVERDUE` with payments, and the PDF prints "Issued · Partially paid". A draft
  is `409 INVOICE_NOT_ISSUED`. It is a specific code like `REPORT_NOT_READY`, not `INVALID_TRANSITION`,
  because nothing is changing state. It is listed in [api.md](../api.md).
- **Access:** the same rules as `GET /invoices/:id`. Admin and ops get any invoice in the
  organisation. The customer gets their own. A contact of another customer in the same organisation
  gets `403 FORBIDDEN`, which is what reading the invoice gives them. A customer asking for a draft
  gets `404` (drafts stay hidden). Technicians get `403` from the role check. Another organisation
  gets `404 INVOICE_NOT_FOUND`. The download is a read, so it writes no audit event.
- **Content** (`invoice.pdf.ts`): the organisation and its GST state, the invoice number, the status
  (overdue and void in red), the issued, due, paid and voided dates (IST), the customer, the site
  address, the equipment and serial number, the supply type (from the stored taxes), the coverage
  (and the contract), the lines with SAC, quantity, rate, amount and covered amount, then subtotal,
  covered, discount, taxable amount, CGST, SGST and IGST (zero components left out, as on the
  invoice page), total, paid and balance, then payments (date, method, reference, amount) and notes.
  A void invoice gets "Tax invoice (void)", a faint diagonal VOID on every page, "This invoice is
  void and is not payable." and a balance of 0.
- **Money:** `INR 2,183.00` with Indian digit grouping. The built-in PDF fonts have no ₹ glyph, so
  the PDF writes "INR" rather than embedding a font.
- **OpenAPI:** the route is generated from the router like the other invoice routes. The generator
  now accepts `produces` (a binary success body) and `conflict` (a GET that can answer 409) per
  controller. Both are set for the invoice PDF and the service report, which used to be documented as
  JSON. `docs/openapi.json` and `docs/api-reference.md` were regenerated.
- **Frontend:** a **Download PDF** button on the invoice page for the statuses in
  `features/invoices/schemas/invoice.schema.ts` (`invoicePdfStatusSchema`, the same list as the
  API). It downloads through `apiBlob`, the authenticated client with refresh, and saves
  `invoice-<number>.pdf`. It is hidden on drafts.

## Tests
`billing.test.ts` → "invoice PDF":
- lets admin, ops and the owning customer download issued, partly paid, paid, overdue and void invoices
- refuses technicians with 403, another organisation with 404, and another customer as reading the invoice does
- answers 409 INVOICE_NOT_ISSUED for a draft, which stays hidden (404) from the customer
- prints the number, status, customer, site, SAC lines, coverage, discount, taxes, payments and balance
- prints the stored figures, never repricing, after the site moves state and prices change

The text checks read the PDF with `unpdf` (dev dependency, pdf.js in pure JS).
`e2e/demo/invoice-pdf-screens.spec.ts` (demo screenshots, not in CI) checks that the button is shown
for a partly paid invoice (ops) and a paid one (customer), downloads both, and confirms that the
button is hidden on a draft.

## Samples
`/workspace/screens/invoice-pdf/` (from the demo data): intra-state paid `INV-2026-00046` and
partly paid (overdue) `INV-2026-00076`; inter-state paid `INV-2026-00023` and partly paid
`INV-2026-00105`; a void `INV-2026-00077`. Each has a `-page1.png` rendering (pdftoppm), plus
screenshots of the button.

## Not done
Credit notes, the customer's GSTIN, a company logo, a custom font for the ₹ sign, and e-mailing the PDF.
