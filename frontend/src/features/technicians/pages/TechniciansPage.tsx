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
import { useCreateTechnician, useTechnicians } from "../hooks/useTechnicians";
import { createTechnicianSchema, type CreateTechnicianInput } from "../schemas/technician.schema";

export function TechniciansPage() {
  const technicians = useTechnicians();
  const createTechnician = useCreateTechnician();
  const [open, setOpen] = useState(false);
  const form = useForm<CreateTechnicianInput>({
    resolver: zodResolver(createTechnicianSchema),
    defaultValues: { name: "", email: "", password: "", phone: "" },
  });

  function closeDialog() {
    form.reset();
    setOpen(false);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Technicians</CardTitle>
          <CardDescription>People who go on site.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setOpen(true)}>
              Add technician
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {technicians.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {technicians.isError ? <p className="text-sm text-destructive">Could not load technicians.</p> : null}
          {technicians.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No technicians yet</EmptyTitle>
                <EmptyDescription>Add a technician so they can sign in and see their profile.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {technicians.data && technicians.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.data.map((technician) => (
                  <TableRow key={technician.id}>
                    <TableCell>{technician.user.name}</TableCell>
                    <TableCell>{technician.user.email}</TableCell>
                    <TableCell>{technician.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={technician.isActive ? "secondary" : "outline"}>
                        {technician.isActive ? "Active" : "Inactive"}
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
              createTechnician.mutate(
                {
                  name: values.name,
                  email: values.email,
                  password: values.password,
                  phone: blankToUndefined(values.phone),
                },
                {
                  onSuccess: () => {
                    toast.success("Technician added");
                    closeDialog();
                  },
                  onError: (error) => toastError(error, "Could not add the technician"),
                },
              );
            })}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Add technician</DialogTitle>
              <DialogDescription>This creates a sign-in for a field technician.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={form.formState.errors.name ? true : undefined}>
                <FieldLabel htmlFor="tech-name">Name</FieldLabel>
                <Input id="tech-name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field data-invalid={form.formState.errors.email ? true : undefined}>
                <FieldLabel htmlFor="tech-email">Email</FieldLabel>
                <Input id="tech-email" type="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field data-invalid={form.formState.errors.password ? true : undefined}>
                <FieldLabel htmlFor="tech-password">Password</FieldLabel>
                <Input id="tech-password" type="password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register("password")} />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tech-phone">Phone</FieldLabel>
                <Input id="tech-phone" {...form.register("phone")} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTechnician.isPending}>
                {createTechnician.isPending ? "Saving..." : "Add technician"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
