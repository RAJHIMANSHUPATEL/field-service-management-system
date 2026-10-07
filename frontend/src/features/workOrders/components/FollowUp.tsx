import { useState } from "react";
import { toast } from "sonner";
import { selectClassName, textareaClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Part } from "@/features/masterData/api/masterData.api";
import { useCatalog } from "@/features/masterData/hooks/useMasterData";
import { toastError } from "@/lib/toastError";
import type { PartRequest, UnsuccessfulInput } from "../api/workOrders.api";
import { useEndVisitUnsuccessful, useResolvePartRequest } from "../hooks/useWorkOrders";

// The technician ends a visit that cannot finish today.
export function UnsuccessfulDialog({
  workOrderId,
  visitId,
  onClose,
}: {
  workOrderId: string;
  visitId: string;
  onClose: () => void;
}) {
  const parts = useCatalog<Part>("parts");
  const end = useEndVisitUnsuccessful(workOrderId);
  const [outcome, setOutcome] = useState<UnsuccessfulInput["outcome"]>("FOLLOW_UP_REQUIRED");
  const [reason, setReason] = useState("");
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const amount = Number.parseInt(quantity, 10);
  const needsPart = outcome === "AWAITING_PARTS";
  const ready = reason.trim() && (!needsPart || (partId && amount > 0));

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) {
              return;
            }
            end.mutate(
              {
                visitId,
                outcome,
                reason: reason.trim(),
                partRequests: needsPart ? [{ partId, quantity: amount }] : [],
              },
              {
                onSuccess: () => {
                  toast.success("Visit ended; the job stays open");
                  onClose();
                },
                onError: (error) => toastError(error, "Could not end the visit"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Can't finish today</DialogTitle>
            <DialogDescription>The job stays open for a second visit.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="outcome">Outcome</FieldLabel>
              <select
                id="outcome"
                className={selectClassName}
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as UnsuccessfulInput["outcome"])}
              >
                <option value="FOLLOW_UP_REQUIRED">Follow-up visit needed</option>
                <option value="AWAITING_PARTS">Waiting for a part</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="outcome-reason">Reason</FieldLabel>
              <textarea
                id="outcome-reason"
                className={textareaClassName}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {needsPart ? (
              <>
                <Field>
                  <FieldLabel htmlFor="needed-part">Part needed</FieldLabel>
                  <select id="needed-part" className={selectClassName} value={partId} onChange={(event) => setPartId(event.target.value)}>
                    <option value="">Choose a part</option>
                    {(parts.data ?? [])
                      .filter((row) => row.isActive)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.sku} · {row.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="needed-quantity">Quantity needed</FieldLabel>
                  <Input id="needed-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready || end.isPending}>
              {end.isPending ? "Saving..." : "End visit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const requestLabels: Record<PartRequest["status"], string> = {
  OPEN: "Open",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

export function PartRequests({
  workOrderId,
  requests,
  canResolve,
}: {
  workOrderId: string;
  requests: PartRequest[];
  canResolve: boolean;
}) {
  const resolve = useResolvePartRequest(workOrderId);
  if (requests.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Part requests</p>
      <ul className="flex flex-col gap-2" aria-label="Part requests">
        {requests.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span>
              {row.quantity} × {row.part.sku} · {row.part.name}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={row.status === "OPEN" ? "default" : "secondary"}>{requestLabels[row.status]}</Badge>
              {canResolve && row.status === "OPEN" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      resolve.mutate(
                        { id: row.id, action: "fulfil" },
                        { onSuccess: () => toast.success("Part request fulfilled"), onError: (error) => toastError(error, "Could not update") },
                      )
                    }
                  >
                    Mark fulfilled
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      resolve.mutate(
                        { id: row.id, action: "cancel" },
                        { onSuccess: () => toast.success("Part request cancelled"), onError: (error) => toastError(error, "Could not update") },
                      )
                    }
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
