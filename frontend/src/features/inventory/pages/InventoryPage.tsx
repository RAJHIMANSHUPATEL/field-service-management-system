import { useState } from "react";
import { toast } from "sonner";
import { selectClassName } from "@/components/content";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import type { Part, Warehouse } from "@/features/masterData/api/masterData.api";
import { useCatalog } from "@/features/masterData/hooks/useMasterData";
import { toastError } from "@/lib/toastError";
import { movementLabels, type StockAction } from "../api/inventory.api";
import { useMovements, useRecordStock, useStock } from "../hooks/useInventory";

type Mode = StockAction["kind"];

const modeTitles: Record<Mode, string> = {
  receipts: "Receive stock",
  transfers: "Transfer stock",
  adjustments: "Adjust stock",
};

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function InventoryPage() {
  const currentUser = useCurrentUser();
  const isPlanner = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const stock = useStock();
  const movements = useMovements();
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Parts and stock</CardTitle>
          <CardDescription>On hand, reserved for visits, and available at each location.</CardDescription>
          {isPlanner ? (
            <CardAction>
              {(Object.keys(modeTitles) as Mode[]).map((key) => (
                <Button key={key} type="button" variant="outline" onClick={() => setMode(key)}>
                  {modeTitles[key]}
                </Button>
              ))}
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {stock.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {stock.isError ? <p className="text-sm text-destructive">Could not load stock.</p> : null}
          {stock.data?.length === 0 ? <p className="text-sm text-muted-foreground">No stock recorded yet.</p> : null}
          {stock.data && stock.data.length > 0 ? (
            <Table aria-label="Stock levels">
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead nowrap className="text-right">On hand</TableHead>
                  <TableHead nowrap className="text-right">Reserved</TableHead>
                  <TableHead nowrap className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.warehouse.name}</TableCell>
                    <TableCell>
                      {row.part.sku} · {row.part.name}
                    </TableCell>
                    <TableCell nowrap className="text-right">{row.onHand}</TableCell>
                    <TableCell nowrap className="text-right">{row.reserved}</TableCell>
                    <TableCell nowrap className="text-right font-medium">{row.available}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Movement ledger</CardTitle>
          <CardDescription>Every change with its reason and who made it, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {movements.data && movements.data.length > 0 ? (
            <Table aria-label="Stock movements">
              <TableHeader>
                <TableRow>
                  <TableHead nowrap>When</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead nowrap className="text-right">On hand</TableHead>
                  <TableHead nowrap className="text-right">Reserved</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell nowrap>{new Date(row.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</TableCell>
                    <TableCell>{movementLabels[row.kind]}</TableCell>
                    <TableCell>{row.warehouse.name}</TableCell>
                    <TableCell nowrap>{row.part.sku}</TableCell>
                    <TableCell nowrap className="text-right">{row.onHandDelta ? signed(row.onHandDelta) : "—"}</TableCell>
                    <TableCell nowrap className="text-right">{row.reservedDelta ? signed(row.reservedDelta) : "—"}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.actor.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          )}
        </CardContent>
      </Card>
      {mode ? <StockDialog mode={mode} onClose={() => setMode(null)} /> : null}
    </div>
  );
}

function StockDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const parts = useCatalog<Part>("parts");
  const warehouses = useCatalog<Warehouse>("warehouses");
  const record = useRecordStock();
  const [partId, setPartId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const amount = Number.parseInt(quantity, 10);
  const ready =
    partId && warehouseId && reason.trim() && Number.isInteger(amount) && amount !== 0 && (mode !== "transfers" || toWarehouseId);
  const activeParts = (parts.data ?? []).filter((row) => row.isActive);
  const locations = (warehouses.data ?? []).filter((row) => row.isActive);

  function action(): StockAction {
    const base = { partId, reason: reason.trim() };
    if (mode === "transfers") {
      return { kind: mode, ...base, fromWarehouseId: warehouseId, toWarehouseId, quantity: amount };
    }
    if (mode === "adjustments") {
      return { kind: mode, ...base, warehouseId, quantityDelta: amount };
    }
    return { kind: mode, ...base, warehouseId, quantity: amount };
  }

  function locationSelect(id: string, label: string, value: string, onChange: (value: string) => void) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <select id={id} className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose a location</option>
          {locations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </Field>
    );
  }

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
            record.mutate(action(), {
              onSuccess: () => {
                toast.success("Stock updated");
                onClose();
              },
              onError: (error) => toastError(error, "Could not update the stock"),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{modeTitles[mode]}</DialogTitle>
            <DialogDescription>Every movement needs a reason; it is kept in the ledger.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="stock-part">Part</FieldLabel>
              <select id="stock-part" className={selectClassName} value={partId} onChange={(event) => setPartId(event.target.value)}>
                <option value="">Choose a part</option>
                {activeParts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.sku} · {row.name}
                  </option>
                ))}
              </select>
            </Field>
            {locationSelect("stock-from", mode === "transfers" ? "From" : "Location", warehouseId, setWarehouseId)}
            {mode === "transfers" ? locationSelect("stock-to", "To", toWarehouseId, setToWarehouseId) : null}
            <Field>
              <FieldLabel htmlFor="stock-quantity">{mode === "adjustments" ? "Change (+ or −)" : "Quantity"}</FieldLabel>
              <Input id="stock-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="stock-reason">Reason</FieldLabel>
              <Input id="stock-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || record.isPending}>
              {record.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
