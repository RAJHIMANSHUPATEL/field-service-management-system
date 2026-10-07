import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { recordLinkClassName } from "@/components/content";
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
import { useCreateCustomer, useCustomers } from "../hooks/useCustomers";
import { createCustomerSchema, type CreateCustomerInput } from "../schemas/customer.schema";

export function CustomersPage() {
  const customers = useCustomers();
  const createCustomer = useCreateCustomer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { name: "", phone: "", email: "" },
  });

  function closeDialog() {
    form.reset();
    setOpen(false);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>Accounts this company services.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setOpen(true)}>
              New customer
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {customers.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {customers.isError ? <p className="text-sm text-destructive">Could not load customers.</p> : null}
          {customers.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No customers yet</EmptyTitle>
                <EmptyDescription>Create a customer to start a service account.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {customers.data && customers.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link className={recordLinkClassName} to={`/customers/${customer.id}`}>
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.phone ?? "—"}</TableCell>
                    <TableCell>{customer.email ?? "—"}</TableCell>
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
              createCustomer.mutate(
                {
                  name: values.name,
                  phone: blankToUndefined(values.phone),
                  email: blankToUndefined(values.email),
                },
                {
                  onSuccess: (customer) => {
                    toast.success("Customer created");
                    closeDialog();
                    navigate(`/customers/${customer.id}`);
                  },
                  onError: (error) => toastError(error, "Could not create the customer"),
                },
              );
            })}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>New customer</DialogTitle>
              <DialogDescription>Add the account before contacts, addresses, and equipment.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={form.formState.errors.name ? true : undefined}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" {...form.register("phone")} />
              </Field>
              <Field data-invalid={form.formState.errors.email ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? "Saving..." : "Create customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
