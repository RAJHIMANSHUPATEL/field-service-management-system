import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { recordLinkClassName, selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAllAssets } from "@/features/assets/hooks/useAssets";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { useServiceTypes } from "@/features/serviceTypes/hooks/useServiceTypes";
import { toastError } from "@/lib/toastError";
import { day, visitsLabel } from "../api/contracts.api";
import { useCancelContract, useContracts, useCreateContract, useCreatePlan, useMovePlan, usePlans, useRunPlans } from "../hooks/useContracts";

const today = () => new Date().toISOString().slice(0, 10);

export function ContractsPage() {
  const contracts = useContracts();
  const plans = usePlans();
  const cancel = useCancelContract();
  const move = useMovePlan();
  const run = useRunPlans();
  const [dialog, setDialog] = useState<"contract" | "plan" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Service contracts</CardTitle>
          <CardDescription>Period, covered equipment, coverage and included visits.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setDialog("contract")}>
              New contract
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {contracts.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {contracts.data?.length === 0 ? <p className="text-sm text-muted-foreground">No contracts yet.</p> : null}
          {contracts.data && contracts.data.length > 0 ? (
            <Table aria-label="Contracts">
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.customer.name}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {day(row.startsOn)} – {day(row.endsOn)}
                    </TableCell>
                    <TableCell>{row.assets.map((item) => `${item.asset.equipmentType} · ${item.asset.serialNumber}`).join(", ")}</TableCell>
                    <TableCell className="text-xs">
                      Service {row.serviceChargeCoveredPercent}% · Labour {row.labourCoveredPercent}% · Parts {row.partsCoveredPercent}%
                    </TableCell>
                    <TableCell data-testid={`contract-visits-${row.id}`}>{visitsLabel(row)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>{row.status === "ACTIVE" ? "Active" : "Cancelled"}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancel.isPending}
                          onClick={() => {
                            const reason = window.prompt("Why is this contract being cancelled?");
                            if (reason?.trim()) {
                              cancel.mutate({ id: row.id, reason: reason.trim() }, { onError: (error) => toastError(error, "Could not cancel") });
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Maintenance plans</CardTitle>
          <CardDescription>When a plan is due, the system opens a work order. Completing it schedules the next one.</CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(undefined, {
                  onSuccess: (result) => toast.success(`${result.data.length} work order${result.data.length === 1 ? "" : "s"} opened`),
                  onError: (error) => toastError(error, "Could not check plans"),
                })
              }
            >
              Check due plans now
            </Button>
            <Button type="button" onClick={() => setDialog("plan")}>
              New plan
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {plans.data?.length === 0 ? <p className="text-sm text-muted-foreground">No plans yet.</p> : null}
          {plans.data && plans.data.length > 0 ? (
            <Table aria-label="Maintenance plans">
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Every</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Latest job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.data.map((row) => {
                  const latest = row.workOrders[0];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.customer.name}
                          {row.contract ? ` · ${row.contract.name}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.asset.equipmentType} · {row.asset.serialNumber}
                      </TableCell>
                      <TableCell>{row.intervalDays} days</TableCell>
                      <TableCell data-testid={`plan-next-${row.id}`}>{day(row.nextDueOn)}</TableCell>
                      <TableCell>
                        {latest ? (
                          <Link className={recordLinkClassName} to={`/work-orders/${latest.id}`}>
                            {latest.status === "COMPLETED" ? "Completed" : "Open"} · {day(latest.createdAt)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.isActive ? "default" : "secondary"}>{row.isActive ? "Active" : "Paused"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={move.isPending}
                          onClick={() => move.mutate({ id: row.id, action: row.isActive ? "pause" : "resume" })}
                        >
                          {row.isActive ? "Pause" : "Resume"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      {dialog === "contract" ? <ContractDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "plan" ? <PlanDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function ContractDialog({ onClose }: { onClose: () => void }) {
  const customers = useCustomers();
  const assets = useAllAssets();
  const create = useCreateContract();
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState("");
  const [visits, setVisits] = useState("");
  const [percent, setPercent] = useState({ service: "100", labour: "100", parts: "0" });
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const customerAssets = (assets.data ?? []).filter((row) => row.customerId === customerId);
  const ready = customerId && name.trim() && startsOn && endsOn && assetIds.length > 0;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) {
              return;
            }
            create.mutate(
              {
                customerId,
                name: name.trim(),
                startsOn,
                endsOn,
                assetIds,
                includedVisits: visits ? Number(visits) : undefined,
                serviceChargeCoveredPercent: Number(percent.service),
                labourCoveredPercent: Number(percent.labour),
                partsCoveredPercent: Number(percent.parts),
              },
              {
                onSuccess: () => {
                  toast.success("Contract created");
                  onClose();
                },
                onError: (error) => toastError(error, "Could not create the contract"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New contract</DialogTitle>
            <DialogDescription>Coverage applies to jobs on the chosen equipment completed within the period.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="contract-customer">Customer</FieldLabel>
              <select
                id="contract-customer"
                className={selectClassName}
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setAssetIds([]);
                }}
              >
                <option value="">Choose a customer</option>
                {(customers.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="contract-name">Name</FieldLabel>
              <Input id="contract-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="contract-start">Starts</FieldLabel>
                <Input id="contract-start" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-end">Ends</FieldLabel>
                <Input id="contract-end" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="contract-visits">Included visits (blank for unlimited)</FieldLabel>
              <Input id="contract-visits" inputMode="numeric" value={visits} onChange={(event) => setVisits(event.target.value.replace(/\D/g, ""))} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              {(["service", "labour", "parts"] as const).map((key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`contract-${key}`}>{key === "service" ? "Service %" : key === "labour" ? "Labour %" : "Parts %"}</FieldLabel>
                  <Input
                    id={`contract-${key}`}
                    inputMode="numeric"
                    value={percent[key]}
                    onChange={(event) => setPercent({ ...percent, [key]: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                  />
                </Field>
              ))}
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Equipment</legend>
              {customerId && customerAssets.length === 0 ? <p className="text-sm text-muted-foreground">This customer has no equipment.</p> : null}
              {customerAssets.map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assetIds.includes(row.id)}
                    onChange={(event) =>
                      setAssetIds(event.target.checked ? [...assetIds, row.id] : assetIds.filter((value) => value !== row.id))
                    }
                  />
                  {row.equipmentType} · {row.serialNumber}
                </label>
              ))}
            </fieldset>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || create.isPending}>
              Create contract
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ onClose }: { onClose: () => void }) {
  const assets = useAllAssets();
  const serviceTypes = useServiceTypes();
  const contracts = useContracts();
  const create = useCreatePlan();
  const [assetId, setAssetId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [contractId, setContractId] = useState("");
  const [name, setName] = useState("");
  const [intervalDays, setIntervalDays] = useState("90");
  const [leadDays, setLeadDays] = useState("0");
  const [firstDueOn, setFirstDueOn] = useState(today());
  const covering = (contracts.data ?? []).filter(
    (row) => row.status === "ACTIVE" && row.assets.some((item) => item.asset.id === assetId),
  );
  const ready = assetId && serviceTypeId && name.trim() && Number(intervalDays) > 0 && firstDueOn;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) {
              return;
            }
            create.mutate(
              {
                assetId,
                serviceTypeId,
                contractId: contractId || undefined,
                name: name.trim(),
                intervalDays: Number(intervalDays),
                leadDays: Number(leadDays || 0),
                firstDueOn,
              },
              {
                onSuccess: () => {
                  toast.success("Plan created");
                  onClose();
                },
                onError: (error) => toastError(error, "Could not create the plan"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New maintenance plan</DialogTitle>
            <DialogDescription>The first job opens on the due date, or the lead days before it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="plan-asset">Equipment</FieldLabel>
              <select
                id="plan-asset"
                className={selectClassName}
                value={assetId}
                onChange={(event) => {
                  setAssetId(event.target.value);
                  setContractId("");
                }}
              >
                <option value="">Choose equipment</option>
                {(assets.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.customer?.name ?? "Customer"} · {row.equipmentType} · {row.serialNumber}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-service">Service type</FieldLabel>
              <select id="plan-service" className={selectClassName} value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)}>
                <option value="">Choose a service</option>
                {(serviceTypes.data ?? [])
                  .filter((row) => row.isActive)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-contract">Contract</FieldLabel>
              <select id="plan-contract" className={selectClassName} value={contractId} onChange={(event) => setContractId(event.target.value)}>
                <option value="">No contract</option>
                {covering.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-name">Name</FieldLabel>
              <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="plan-interval">Every (days)</FieldLabel>
                <Input id="plan-interval" inputMode="numeric" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-lead">Lead days</FieldLabel>
                <Input id="plan-lead" inputMode="numeric" value={leadDays} onChange={(event) => setLeadDays(event.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-first">First due</FieldLabel>
                <Input id="plan-first" type="date" value={firstDueOn} onChange={(event) => setFirstDueOn(event.target.value)} />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || create.isPending}>
              Create plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
