import { useState } from "react";
import { toast } from "sonner";
import { selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useStock } from "@/features/inventory/hooks/useInventory";
import { toastError } from "@/lib/toastError";
import type { Visit, VisitPart } from "../api/workOrders.api";
import { useAddVisitPart, useMoveVisitPart } from "../hooks/useWorkOrders";

const statusLabels: Record<VisitPart["status"], string> = {
  RESERVED: "Reserved",
  CONSUMED: "Used",
  RELEASED: "Released",
  RETURNED: "Returned",
};

// Reserve parts from the van at diagnosis, then mark them used once the work has started.
export function VisitParts({ workOrderId, visit }: { workOrderId: string; visit: Visit }) {
  const stock = useStock();
  const add = useAddVisitPart(workOrderId);
  const move = useMoveVisitPart(workOrderId);
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const inProgress = visit.status === "IN_PROGRESS";
  const options = (stock.data ?? []).filter((row) => row.warehouse.kind === "VAN" && row.available > 0);
  const amount = Number.parseInt(quantity, 10);

  function act(row: VisitPart, action: "consume" | "release" | "return", done: string) {
    move.mutate(
      { visitId: visit.id, visitPartId: row.id, action, ...(action === "return" ? { reason: "Returned unused" } : {}) },
      { onSuccess: () => toast.success(done), onError: (error) => toastError(error, "Could not update the part") },
    );
  }

  return (
    <div className="flex flex-col gap-2" aria-label="Parts">
      <p className="text-sm font-medium">Parts</p>
      {visit.parts.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Visit parts">
          {visit.parts.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 rounded border px-2 py-2 text-sm">
              <span className="flex items-center justify-between gap-2">
                <span>
                  {row.quantity} × {row.part.name}
                </span>
                <Badge variant={row.status === "CONSUMED" ? "default" : "secondary"}>{statusLabels[row.status]}</Badge>
              </span>
              {row.status === "RESERVED" ? (
                <span className="flex gap-2">
                  {inProgress ? (
                    <Button type="button" size="sm" className="h-10 flex-1" onClick={() => act(row, "consume", "Part used")}>
                      Use
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" className="h-10 flex-1" onClick={() => act(row, "release", "Part released")}>
                    Release
                  </Button>
                </span>
              ) : null}
              {row.status === "CONSUMED" && inProgress ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => act(row, "return", "Part returned")}>
                  Return to van
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <FieldLabel htmlFor="visit-part">Part from van</FieldLabel>
      <select id="visit-part" className={selectClassName} value={partId} onChange={(event) => setPartId(event.target.value)}>
        <option value="">{options.length ? "Choose a part" : "No van stock available"}</option>
        {options.map((row) => (
          <option key={row.id} value={row.part.id}>
            {row.part.name} ({row.available} available)
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Input
          aria-label="Part quantity"
          inputMode="numeric"
          className="w-20"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1"
          disabled={!partId || !(amount > 0) || add.isPending}
          onClick={() =>
            add.mutate(
              { visitId: visit.id, partId, quantity: amount },
              {
                onSuccess: () => {
                  setPartId("");
                  setQuantity("1");
                  toast.success("Part reserved");
                },
                onError: (error) => toastError(error, "Could not reserve the part"),
              },
            )
          }
        >
          Reserve part
        </Button>
      </div>
    </div>
  );
}
