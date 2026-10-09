import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { recordLinkClassName, selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { toastError } from "@/lib/toastError";
import { downloadInvoicePdf, formatMoney, invoiceActions, invoiceStatusLabels, openServiceReport, type Adjustment, type Invoice } from "../api/invoices.api";
import { AdjustmentDialog } from "../components/AdjustmentDialog";
import { useInvoice, useInvoiceAction, usePaymentOptions } from "../hooks/useInvoices";
import { canCredit, canDownloadInvoicePdf, canRefund } from "../schemas/invoice.schema";

const coverageLabels: Record<Invoice["coverageSource"], string> = {
  NONE: "Not covered",
  WARRANTY: "Covered by warranty",
  CONTRACT: "Covered by contract",
};

export function InvoiceDetailPage() {
  const { invoiceId = "" } = useParams();
  const currentUser = useCurrentUser();
  const invoice = useInvoice(invoiceId);
  const isOffice = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const isCustomer = currentUser.data?.role === "CUSTOMER";
  const [downloading, setDownloading] = useState(false);
  const [dialog, setDialog] = useState<"credit" | "refund" | null>(null);
  const issue = useInvoiceAction(invoiceId, () => invoiceActions.issue(invoiceId));
  const payOnline = useInvoiceAction(invoiceId, () => invoiceActions.payOnline(invoiceId));
  // Pay appears only when the API offers online pay (off while the provider is the mock).
  const paymentOptions = usePaymentOptions(isCustomer);
  const onlinePay = paymentOptions.data?.onlinePay === true;

  if (invoice.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (invoice.isError || !invoice.data) {
    return <p className="text-sm text-destructive">Could not load this invoice.</p>;
  }
  const record = invoice.data;
  const money = (value: string) => formatMoney(value, record.currency);
  // One balance definition, computed by the API (the PDF prints the same figures).
  const { balance, refundDue, creditable, refundable } = record.settlement;
  const payable = record.status === "ISSUED" || record.status === "OVERDUE";
  const halfRate = (Number(record.taxRatePercent) / 2).toString();
  // Only the components that apply: CGST and SGST within the state, IGST across states.
  const taxRows = [
    { label: "CGST", rate: halfRate, amount: record.cgst },
    { label: "SGST", rate: halfRate, amount: record.sgst },
    { label: "IGST", rate: Number(record.taxRatePercent).toString(), amount: record.igst },
  ].filter((row) => Number(row.amount) !== 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant={record.status === "OVERDUE" ? "destructive" : record.status === "PAID" ? "default" : "secondary"}>
              {invoiceStatusLabels[record.status]}
            </Badge>
            {payable && Number(record.settlement.netPaid) > 0 ? <Badge variant="outline">Partially paid</Badge> : null}
            {Number(refundDue) > 0 ? <Badge variant="destructive">Refund due</Badge> : null}
            <Badge variant="outline">{coverageLabels[record.coverageSource]}</Badge>
          </div>
          <CardTitle>{record.number ?? "Draft invoice"}</CardTitle>
          <CardDescription>
            {record.customer.name} · {record.workOrder.asset.equipmentType} · {record.workOrder.serviceType.name}
            {record.contract ? ` · ${record.contract.name}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table aria-label="Invoice lines">
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead nowrap className="text-right">Qty</TableHead>
                <TableHead nowrap className="text-right">Rate</TableHead>
                <TableHead nowrap className="text-right">Amount</TableHead>
                <TableHead nowrap className="text-right">Covered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.description}
                    {line.sacCode ? <span className="text-xs text-muted-foreground"> · SAC {line.sacCode}</span> : null}
                  </TableCell>
                  <TableCell nowrap className="text-right">{Number(line.quantity)}</TableCell>
                  <TableCell nowrap className="text-right">{money(line.unitPrice)}</TableCell>
                  <TableCell nowrap className="text-right">{money(line.amount)}</TableCell>
                  <TableCell nowrap className="text-right">{Number(line.coveredAmount) > 0 ? `−${money(line.coveredAmount)}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm" aria-label="Invoice totals">
            <dt>Subtotal</dt>
            <dd className="text-right">{money(record.subtotal)}</dd>
            {Number(record.coveredTotal) > 0 ? (
              <>
                <dt>Covered</dt>
                <dd className="text-right">−{money(record.coveredTotal)}</dd>
              </>
            ) : null}
            {Number(record.discount) > 0 ? (
              <>
                <dt>Discount</dt>
                <dd className="text-right">−{money(record.discount)}</dd>
              </>
            ) : null}
            {taxRows.map((row) => (
              <Fragment key={row.label}>
                <dt>
                  {row.label} {row.rate}%
                </dt>
                <dd className="text-right" data-testid={`invoice-${row.label.toLowerCase()}`}>
                  {money(row.amount)}
                </dd>
              </Fragment>
            ))}
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold" data-testid="invoice-total">
              {money(record.total)}
            </dd>
            {Number(record.creditedTotal) > 0 ? (
              <>
                <dt>Credit notes</dt>
                <dd className="text-right" data-testid="invoice-credited">
                  −{money(record.creditedTotal)}
                </dd>
              </>
            ) : null}
            <dt>Paid</dt>
            <dd className="text-right">{money(record.amountPaid)}</dd>
            {Number(record.refundedTotal) > 0 ? (
              <>
                <dt>Refunded</dt>
                <dd className="text-right" data-testid="invoice-refunded">
                  −{money(record.refundedTotal)}
                </dd>
              </>
            ) : null}
            <dt className="font-semibold">Balance</dt>
            <dd className="text-right font-semibold" data-testid="invoice-balance">
              {money(balance)}
            </dd>
            {Number(refundDue) > 0 ? (
              <>
                <dt className="font-semibold text-destructive">Refund due</dt>
                <dd className="text-right font-semibold text-destructive" data-testid="invoice-refund-due">
                  {money(refundDue)}
                </dd>
              </>
            ) : null}
            {isOffice && record.status !== "DRAFT" && record.status !== "VOID" ? (
              <>
                <dt className="text-muted-foreground">Creditable</dt>
                <dd className="text-right text-muted-foreground" data-testid="invoice-creditable">
                  {money(creditable)}
                </dd>
                <dt className="text-muted-foreground">Refundable</dt>
                <dd className="text-right text-muted-foreground" data-testid="invoice-refundable">
                  {money(refundable)}
                </dd>
              </>
            ) : null}
          </dl>
          {record.dueAt ? <p className="text-sm text-muted-foreground">Due {new Date(record.dueAt).toLocaleDateString()}</p> : null}
          {record.notes ? <p className="text-sm whitespace-pre-line">{record.notes}</p> : null}
          {record.payments.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Payments">
              {record.payments.map((payment) => (
                <li key={payment.id}>
                  {money(payment.amount)} · {payment.method.replace("_", " ").toLowerCase()} ·{" "}
                  {new Date(payment.paidAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <AdjustmentList title="Credit notes" rows={record.creditNotes} money={money} />
          <AdjustmentList title="Refunds" rows={record.refunds} money={money} />
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          {canDownloadInvoicePdf(record.status) ? (
            <Button
              type="button"
              disabled={downloading}
              onClick={() => {
                setDownloading(true);
                downloadInvoicePdf(record.id, record.number)
                  .catch((error: unknown) => toastError(error, "Could not download the invoice PDF"))
                  .finally(() => setDownloading(false));
              }}
            >
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => openServiceReport(record.workOrder.id).catch((error: unknown) => toastError(error, "Could not open the report"))}
          >
            Service report
          </Button>
          {isOffice ? (
            <Button variant="outline" nativeButton={false} render={<Link to={`/work-orders/${record.workOrder.id}`} />}>
              Work order
            </Button>
          ) : null}
          {isOffice && record.status === "DRAFT" ? (
            <Button
              type="button"
              disabled={issue.isPending}
              onClick={() =>
                issue.mutate(undefined, {
                  onSuccess: () => toast.success("Invoice issued"),
                  onError: (error) => toastError(error, "Could not issue the invoice"),
                })
              }
            >
              Issue invoice
            </Button>
          ) : null}
          {isOffice && canCredit(record.status, creditable) ? (
            <Button type="button" variant="outline" onClick={() => setDialog("credit")}>
              Issue credit note
            </Button>
          ) : null}
          {isOffice && canRefund(record.status, refundable) ? (
            <Button type="button" variant="outline" onClick={() => setDialog("refund")}>
              Refund
            </Button>
          ) : null}
          {isCustomer && payable && onlinePay ? (
            <Button
              type="button"
              disabled={payOnline.isPending}
              onClick={() =>
                payOnline.mutate(undefined, {
                  onSuccess: () => toast.success("Payment received"),
                  onError: (error) => toastError(error, "Could not take the payment"),
                })
              }
            >
              {payOnline.isPending ? "Paying..." : `Pay ${money(balance)}`}
            </Button>
          ) : null}
          {isCustomer && payable && paymentOptions.isSuccess && !onlinePay && Number(balance) > 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="invoice-pay-offline">
              Pay {money(balance)} to the office by cash, UPI, card or bank transfer.
            </p>
          ) : null}
        </CardFooter>
      </Card>
      {isOffice && record.status === "DRAFT" ? <DraftEditor invoiceId={record.id} /> : null}
      {isOffice && payable ? <PaymentForm invoiceId={record.id} balance={balance} /> : null}
      {isOffice && (record.status === "DRAFT" || (payable && record.payments.length === 0 && record.creditNotes.length === 0)) ? (
        <VoidForm invoiceId={record.id} />
      ) : null}
      {isOffice ? (
        <>
          <AdjustmentDialog kind="credit" invoice={record} open={dialog === "credit"} onOpenChange={(open) => setDialog(open ? "credit" : null)} />
          <AdjustmentDialog kind="refund" invoice={record} open={dialog === "refund"} onOpenChange={(open) => setDialog(open ? "refund" : null)} />
        </>
      ) : null}
      {isCustomer ? (
        <Link className={recordLinkClassName} to={`/requests/${record.workOrder.request.id}`}>
          Back to the request
        </Link>
      ) : null}
    </div>
  );
}

function AdjustmentList({ title, rows, money }: { title: string; rows: Adjustment[]; money: (value: string) => string }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((row) => (
          <li key={row.id}>
            <span className="font-medium">{row.number}</span> · −{money(row.amount)} ·{" "}
            {new Date(row.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })} · {row.reason}
            <span className="text-muted-foreground"> · {row.createdBy.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraftEditor({ invoiceId }: { invoiceId: string }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const addLine = useInvoiceAction(invoiceId, () => invoiceActions.addLine(invoiceId, description.trim(), amount));
  const applyDiscount = useInvoiceAction(invoiceId, () => invoiceActions.discount(invoiceId, discount));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjust draft</CardTitle>
        <CardDescription>Add a charge or a discount before issuing. Coverage and tax are recalculated.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="line-description">Additional charge</FieldLabel>
            <Input id="line-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="line-amount">Charge amount</FieldLabel>
            <Input id="line-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
        </FieldGroup>
        <Button
          type="button"
          variant="outline"
          disabled={!description.trim() || !amount || addLine.isPending}
          onClick={() =>
            addLine.mutate(undefined, {
              onSuccess: () => {
                setDescription("");
                setAmount("");
                toast.success("Charge added");
              },
              onError: (error) => toastError(error, "Could not add the charge"),
            })
          }
        >
          Add charge
        </Button>
        <Field>
          <FieldLabel htmlFor="invoice-discount">Discount</FieldLabel>
          <Input id="invoice-discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={!discount || applyDiscount.isPending}
          onClick={() =>
            applyDiscount.mutate(undefined, {
              onSuccess: () => toast.success("Discount applied"),
              onError: (error) => toastError(error, "Could not apply the discount"),
            })
          }
        >
          Apply discount
        </Button>
      </CardContent>
    </Card>
  );
}

function PaymentForm({ invoiceId, balance }: { invoiceId: string; balance: string }) {
  const [amount, setAmount] = useState(balance);
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const record = useInvoiceAction(invoiceId, () =>
    invoiceActions.recordPayment(invoiceId, { amount, method, ...(reference.trim() ? { reference: reference.trim() } : {}) }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record payment</CardTitle>
        <CardDescription>Part payments are allowed; the invoice is paid when the balance reaches zero.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
            <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-method">Method</FieldLabel>
            <select id="payment-method" className={selectClassName} value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-reference">Reference</FieldLabel>
            <Input id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} />
          </Field>
        </FieldGroup>
        <Button
          type="button"
          disabled={!amount || record.isPending}
          onClick={() =>
            record.mutate(undefined, {
              onSuccess: () => toast.success("Payment recorded"),
              onError: (error) => toastError(error, "Could not record the payment"),
            })
          }
        >
          Record payment
        </Button>
      </CardContent>
    </Card>
  );
}

function VoidForm({ invoiceId }: { invoiceId: string }) {
  const [reason, setReason] = useState("");
  const voidInvoice = useInvoiceAction(invoiceId, () => invoiceActions.void(invoiceId, reason.trim()));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Void invoice</CardTitle>
        <CardDescription>Only invoices without payments can be voided.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="void-reason">Void reason</FieldLabel>
          <Input id="void-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Button
          type="button"
          variant="destructive"
          disabled={!reason.trim() || voidInvoice.isPending}
          onClick={() =>
            voidInvoice.mutate(undefined, {
              onSuccess: () => toast.success("Invoice voided"),
              onError: (error) => toastError(error, "Could not void the invoice"),
            })
          }
        >
          Void
        </Button>
      </CardContent>
    </Card>
  );
}
