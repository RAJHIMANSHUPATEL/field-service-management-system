import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { recordLinkClassName, selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { useServiceTypes } from "@/features/serviceTypes/hooks/useServiceTypes";
import { toastError } from "@/lib/toastError";
import type { RequestStatus } from "../api/serviceRequests.api";
import { useCreateServiceRequest, useServiceRequests } from "../hooks/useServiceRequests";
import { createRequestSchema, type CreateRequestInput } from "../schemas/serviceRequest.schema";

const statuses: { value: "" | RequestStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "NEEDS_INFO", label: "Needs information" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
];

export function statusLabel(status: RequestStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function dateLabel(value: string) {
  return value.slice(0, 10);
}

export function RequestsPage() {
  const currentUser = useCurrentUser();
  const canTriage = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const [status, setStatus] = useState<"" | RequestStatus>("");
  const [open, setOpen] = useState(false);
  const requests = useServiceRequests(status ? { status } : {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests</CardTitle>
        <CardDescription>Problems reported against equipment.</CardDescription>
        <CardAction>
          <Button type="button" onClick={() => setOpen(true)}>
            New request
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canTriage ? (
          <select
            className={`${selectClassName} max-w-xs`}
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | RequestStatus)}
          >
            {statuses.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}
        {requests.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {requests.isError ? <p className="text-sm text-destructive">Could not load requests.</p> : null}
        {requests.data?.data.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No requests yet</EmptyTitle>
              <EmptyDescription>Report a problem with a piece of equipment.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {requests.data && requests.data.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                {canTriage ? <TableHead>Customer</TableHead> : null}
                <TableHead>Service</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.data.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link className={recordLinkClassName} to={`/requests/${item.id}`}>
                      {item.asset.equipmentType} {item.asset.serialNumber}
                    </Link>
                  </TableCell>
                  {canTriage ? <TableCell>{item.customer.name}</TableCell> : null}
                  <TableCell>{item.serviceType.name}</TableCell>
                  <TableCell nowrap>
                    {dateLabel(item.preferredStart)} – {dateLabel(item.preferredEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.status === "REJECTED" ? "destructive" : item.status === "ACCEPTED" ? "default" : "secondary"}
                    >
                      {statusLabel(item.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <NewRequestDialog open={open} onOpenChange={setOpen} canSetPriority={canTriage} />
    </Card>
  );
}

function NewRequestDialog({
  open,
  onOpenChange,
  canSetPriority,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSetPriority: boolean;
}) {
  const customers = useCustomers();
  const serviceTypes = useServiceTypes();
  const createRequest = useCreateServiceRequest();
  const [customerId, setCustomerId] = useState("");
  const form = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      assetId: "",
      serviceTypeId: "",
      description: "",
      preferredStart: "",
      preferredEnd: "",
      priority: "NORMAL",
    },
  });

  const selectedCustomer = canSetPriority
    ? customers.data?.find((customer) => customer.id === customerId)
    : customers.data?.[0];
  const assets = selectedCustomer?.assets ?? [];
  const activeTypes = serviceTypes.data?.filter((serviceType) => serviceType.isActive) ?? [];

  function closeDialog() {
    form.reset();
    setCustomerId("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          setCustomerId("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            createRequest.mutate(
              {
                assetId: values.assetId,
                serviceTypeId: values.serviceTypeId,
                description: values.description,
                preferredStart: values.preferredStart,
                preferredEnd: values.preferredEnd,
                ...(canSetPriority && values.priority ? { priority: values.priority } : {}),
              },
              {
                onSuccess: () => {
                  toast.success("Request submitted");
                  closeDialog();
                },
                onError: (error) => toastError(error, "Could not submit the request"),
              },
            );
          })}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>Report a problem on equipment that is already on file.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {canSetPriority ? (
              <Field>
                <FieldLabel htmlFor="request-customer">Customer</FieldLabel>
                <select
                  id="request-customer"
                  className={selectClassName}
                  value={customerId}
                  onChange={(event) => {
                    setCustomerId(event.target.value);
                    form.setValue("assetId", "");
                  }}
                >
                  <option value="">Choose a customer</option>
                  {customers.data?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field data-invalid={form.formState.errors.assetId ? true : undefined}>
              <FieldLabel htmlFor="request-asset">Equipment</FieldLabel>
              <select id="request-asset" className={selectClassName} aria-invalid={Boolean(form.formState.errors.assetId)} {...form.register("assetId")}>
                <option value="">Choose equipment</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.equipmentType} · {asset.serialNumber}
                  </option>
                ))}
              </select>
              <FieldError errors={[form.formState.errors.assetId]} />
            </Field>
            <Field data-invalid={form.formState.errors.serviceTypeId ? true : undefined}>
              <FieldLabel htmlFor="request-service">Service type</FieldLabel>
              <select id="request-service" className={selectClassName} aria-invalid={Boolean(form.formState.errors.serviceTypeId)} {...form.register("serviceTypeId")}>
                <option value="">Choose a service type</option>
                {activeTypes.map((serviceType) => (
                  <option key={serviceType.id} value={serviceType.id}>
                    {serviceType.name}
                  </option>
                ))}
              </select>
              <FieldError errors={[form.formState.errors.serviceTypeId]} />
            </Field>
            <Field data-invalid={form.formState.errors.description ? true : undefined}>
              <FieldLabel htmlFor="request-description">What is wrong</FieldLabel>
              <Input id="request-description" aria-invalid={Boolean(form.formState.errors.description)} {...form.register("description")} />
              <FieldError errors={[form.formState.errors.description]} />
            </Field>
            <Field data-invalid={form.formState.errors.preferredStart ? true : undefined}>
              <FieldLabel htmlFor="request-start">Preferred start</FieldLabel>
              <Input id="request-start" type="date" aria-invalid={Boolean(form.formState.errors.preferredStart)} {...form.register("preferredStart")} />
              <FieldError errors={[form.formState.errors.preferredStart]} />
            </Field>
            <Field data-invalid={form.formState.errors.preferredEnd ? true : undefined}>
              <FieldLabel htmlFor="request-end">Preferred end</FieldLabel>
              <Input id="request-end" type="date" aria-invalid={Boolean(form.formState.errors.preferredEnd)} {...form.register("preferredEnd")} />
              <FieldError errors={[form.formState.errors.preferredEnd]} />
            </Field>
            {canSetPriority ? (
              <Field>
                <FieldLabel htmlFor="request-priority">Priority</FieldLabel>
                <select id="request-priority" className={selectClassName} {...form.register("priority")}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRequest.isPending}>
              {createRequest.isPending ? "Saving..." : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
