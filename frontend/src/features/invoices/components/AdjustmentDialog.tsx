import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/toastError";
import { formatMoney, invoiceActions, type Invoice } from "../api/invoices.api";
import { useInvoiceAction } from "../hooks/useInvoices";
import { adjustmentFormSchema, type AdjustmentFormInput } from "../schemas/invoice.schema";

type Kind = "credit" | "refund";

const copy: Record<Kind, { title: string; description: string; limitLabel: string; submit: string; pending: string; done: string; failed: string }> = {
  credit: {
    title: "Issue credit note",
    description: "Lowers what the customer owes. The invoice lines and total stay as issued.",
    limitLabel: "Creditable",
    submit: "Issue credit note",
    pending: "Issuing...",
    done: "Credit note issued",
    failed: "Could not issue the credit note",
  },
  refund: {
    title: "Refund",
    description: "Records money paid back to the customer. Payments are kept; no money moves through the app.",
    limitLabel: "Refundable",
    submit: "Record refund",
    pending: "Recording...",
    done: "Refund recorded",
    failed: "Could not record the refund",
  },
};

export function AdjustmentDialog({ kind, invoice, open, onOpenChange }: { kind: Kind; invoice: Invoice; open: boolean; onOpenChange: (open: boolean) => void }) {
  const text = copy[kind];
  const limit = kind === "credit" ? invoice.settlement.creditable : invoice.settlement.refundable;
  const limitText = formatMoney(limit, invoice.currency);
  const schema = useMemo(() => adjustmentFormSchema(limit, limitText), [limit, limitText]);
  // A credit defaults to what is still owed (or the rest of the total); a refund to what is owed back.
  const suggested = kind === "credit" ? (Number(invoice.settlement.balance) > 0 ? invoice.settlement.balance : "") : Number(invoice.settlement.refundDue) > 0 ? invoice.settlement.refundDue : "";
  const form = useForm<AdjustmentFormInput>({ resolver: zodResolver(schema), values: { amount: suggested, reason: "" } });
  const action = useInvoiceAction(invoice.id, (input: AdjustmentFormInput) =>
    kind === "credit" ? invoiceActions.creditNote(invoice.id, input) : invoiceActions.refund(invoice.id, input),
  );
  const id = `${kind}-dialog`;

  function close() {
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) =>
            action.mutate(values, {
              onSuccess: () => {
                toast.success(text.done);
                close();
              },
              onError: (error) => toastError(error, text.failed),
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.amount ? true : undefined}>
              <FieldLabel htmlFor={`${id}-amount`}>Amount</FieldLabel>
              <Input id={`${id}-amount`} inputMode="decimal" autoComplete="off" {...form.register("amount")} />
              <FieldDescription data-testid={`${kind}-limit`}>
                {text.limitLabel}: {limitText}
              </FieldDescription>
              <FieldError errors={[form.formState.errors.amount]} />
            </Field>
            <Field data-invalid={form.formState.errors.reason ? true : undefined}>
              <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
              <Input id={`${id}-reason`} {...form.register("reason")} />
              <FieldError errors={[form.formState.errors.reason]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.isPending}>
              {action.isPending ? text.pending : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
