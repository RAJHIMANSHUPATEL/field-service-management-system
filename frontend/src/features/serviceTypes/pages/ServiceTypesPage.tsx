import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { blankToUndefined } from "@/lib/blankToUndefined";
import { toastError } from "@/lib/toastError";
import { useCreateServiceType, useServiceTypes } from "../hooks/useServiceTypes";
import { createServiceTypeSchema, type CreateServiceTypeInput } from "../schemas/serviceType.schema";

export function ServiceTypesPage() {
  const serviceTypes = useServiceTypes();
  const createServiceType = useCreateServiceType();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateServiceTypeInput>({
    resolver: zodResolver(createServiceTypeSchema),
    defaultValues: { name: "", description: "", serviceCharge: "", labourRatePerHour: "" },
  });

  function closeDialog() {
    form.reset();
    setOpen(false);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Service types</CardTitle>
          <CardDescription>Work this company offers.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setOpen(true)}>
              Add service type
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {serviceTypes.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {serviceTypes.isError ? <p className="text-sm text-destructive">Could not load service types.</p> : null}
          {serviceTypes.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No service types yet</EmptyTitle>
                <EmptyDescription>Add a service type such as repair or installation.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {serviceTypes.data && serviceTypes.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead nowrap className="text-right">Service charge</TableHead>
                  <TableHead nowrap className="text-right">Labour / h</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceTypes.data.map((serviceType) => (
                  <TableRow key={serviceType.id}>
                    <TableCell>{serviceType.name}</TableCell>
                    <TableCell>{serviceType.description ?? "—"}</TableCell>
                    <TableCell nowrap className="text-right">{Number(serviceType.serviceCharge).toFixed(2)}</TableCell>
                    <TableCell nowrap className="text-right">{Number(serviceType.labourRatePerHour).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={serviceType.isActive ? "secondary" : "outline"}>
                        {serviceType.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            form.reset();
          }
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              createServiceType.mutate(
                {
                  name: values.name,
                  description: blankToUndefined(values.description),
                  serviceCharge: blankToUndefined(values.serviceCharge),
                  labourRatePerHour: blankToUndefined(values.labourRatePerHour),
                },
                {
                  onSuccess: () => {
                    toast.success("Service type added");
                    closeDialog();
                  },
                  onError: (error) => toastError(error, "Could not add the service type"),
                },
              );
            })}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Add service type</DialogTitle>
              <DialogDescription>Name the kind of work a request can ask for.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={form.formState.errors.name ? true : undefined}>
                <FieldLabel htmlFor="service-name">Name</FieldLabel>
                <Input id="service-name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-description">Description</FieldLabel>
                <Input id="service-description" {...form.register("description")} />
              </Field>
              <Field data-invalid={form.formState.errors.serviceCharge ? true : undefined}>
                <FieldLabel htmlFor="service-charge">Service charge</FieldLabel>
                <Input id="service-charge" inputMode="decimal" {...form.register("serviceCharge")} />
                <FieldError errors={[form.formState.errors.serviceCharge]} />
              </Field>
              <Field data-invalid={form.formState.errors.labourRatePerHour ? true : undefined}>
                <FieldLabel htmlFor="service-labour">Labour rate per hour</FieldLabel>
                <Input id="service-labour" inputMode="decimal" {...form.register("labourRatePerHour")} />
                <FieldError errors={[form.formState.errors.labourRatePerHour]} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createServiceType.isPending}>
                {createServiceType.isPending ? "Saving..." : "Add service type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
