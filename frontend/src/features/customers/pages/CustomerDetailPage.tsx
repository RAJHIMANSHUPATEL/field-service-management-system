import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { AssetForm } from "@/features/assets/components/AssetForm";
import type { CustomerAsset } from "@/features/customers/api/customers.api";
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
import { useCreateAddress, useCreateContact, useCustomer } from "../hooks/useCustomers";
import {
  createAddressSchema,
  createContactSchema,
  type CreateAddressInput,
  type CreateContactInput,
} from "../schemas/customer.schema";

function dateLabel(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function statusLabel(status: string) {
  if (status === "ACTIVE") {
    return "Active";
  }
  if (status === "OUT_OF_SERVICE") {
    return "Out of service";
  }
  return "Decommissioned";
}

export function CustomerDetailPage() {
  const { customerId = "" } = useParams();
  const customer = useCustomer(customerId);
  const [contactOpen, setContactOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [assetForm, setAssetForm] = useState<CustomerAsset | "new" | null>(null);

  if (customer.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (customer.isError || !customer.data) {
    return <p className="text-sm text-destructive">Could not load this customer.</p>;
  }

  const record = customer.data;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{record.name}</CardTitle>
          <CardDescription>
            {[record.phone, record.email].filter(Boolean).join(" · ") || "No phone or email"}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>People who can request service for this account.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setContactOpen(true)}>
              Add contact
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {record.contacts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No contacts yet</EmptyTitle>
                <EmptyDescription>Add a contact. A password also creates a customer login.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell>{contact.email}</TableCell>
                    <TableCell nowrap>{contact.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={contact.hasLogin ? "secondary" : "outline"}>
                        {contact.hasLogin ? "Has login" : "No login"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ContactForm customerId={record.id} open={contactOpen} onOpenChange={setContactOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>Places where equipment is installed.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setAddressOpen(true)}>
              Add address
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {record.addresses.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No addresses yet</EmptyTitle>
                <EmptyDescription>Add an address before recording equipment.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Primary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.addresses.map((address) => (
                  <TableRow key={address.id}>
                    <TableCell>{address.label}</TableCell>
                    <TableCell>
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.postalCode}
                    </TableCell>
                    <TableCell>
                      {address.isPrimary ? <Badge variant="secondary">Primary</Badge> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AddressForm customerId={record.id} open={addressOpen} onOpenChange={setAddressOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
          <CardDescription>Equipment at this customer's addresses.</CardDescription>
          <CardAction>
            <Button type="button" disabled={record.addresses.length === 0} onClick={() => setAssetForm("new")}>
              Add asset
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {record.addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add an address before adding equipment.</p>
          ) : null}
          {record.assets.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No assets yet</EmptyTitle>
                <EmptyDescription>Add equipment after this customer has an address.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>{asset.equipmentType}</TableCell>
                    <TableCell>{asset.model}</TableCell>
                    <TableCell>{asset.serialNumber}</TableCell>
                    <TableCell nowrap>{dateLabel(asset.warrantyExpiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={asset.status === "ACTIVE" ? "secondary" : "outline"}>
                        {statusLabel(asset.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" onClick={() => setAssetForm(asset)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={assetForm !== null} onOpenChange={(next) => { if (!next) setAssetForm(null); }}>
        <DialogContent className="sm:max-w-md">
          {assetForm ? (
            <AssetForm
              customerId={record.id}
              addresses={record.addresses}
              asset={assetForm === "new" ? undefined : assetForm}
              onDone={() => setAssetForm(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactForm({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createContact = useCreateContact(customerId);
  const form = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  function closeDialog() {
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            createContact.mutate(
              {
                name: values.name,
                email: values.email,
                phone: blankToUndefined(values.phone),
                password: blankToUndefined(values.password),
              },
              {
                onSuccess: () => {
                  toast.success("Contact added");
                  closeDialog();
                },
                onError: (error) => toastError(error, "Could not add the contact"),
              },
            );
          })}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>A password also creates a customer login.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.name ? true : undefined}>
              <FieldLabel htmlFor="contact-name">Contact name</FieldLabel>
              <Input id="contact-name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field data-invalid={form.formState.errors.email ? true : undefined}>
              <FieldLabel htmlFor="contact-email">Email</FieldLabel>
              <Input id="contact-email" type="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
              <Input id="contact-phone" {...form.register("phone")} />
            </Field>
            <Field data-invalid={form.formState.errors.password ? true : undefined}>
              <FieldLabel htmlFor="contact-password">Password for a customer login</FieldLabel>
              <Input id="contact-password" type="password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register("password")} />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending ? "Saving..." : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddressForm({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createAddress = useCreateAddress(customerId);
  const form = useForm<CreateAddressInput>({
    resolver: zodResolver(createAddressSchema),
    defaultValues: { label: "", line1: "", line2: "", city: "", state: "", postalCode: "" },
  });

  function closeDialog() {
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            createAddress.mutate(
              {
                label: values.label,
                line1: values.line1,
                line2: blankToUndefined(values.line2),
                city: values.city,
                state: values.state,
                postalCode: values.postalCode,
              },
              {
                onSuccess: () => {
                  toast.success("Address added");
                  closeDialog();
                },
                onError: (error) => toastError(error, "Could not add the address"),
              },
            );
          })}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Add address</DialogTitle>
            <DialogDescription>Add an address before recording equipment.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.label ? true : undefined}>
              <FieldLabel htmlFor="label">Label</FieldLabel>
              <Input id="label" aria-invalid={Boolean(form.formState.errors.label)} {...form.register("label")} />
              <FieldError errors={[form.formState.errors.label]} />
            </Field>
            <Field data-invalid={form.formState.errors.line1 ? true : undefined}>
              <FieldLabel htmlFor="line1">Address line 1</FieldLabel>
              <Input id="line1" aria-invalid={Boolean(form.formState.errors.line1)} {...form.register("line1")} />
              <FieldError errors={[form.formState.errors.line1]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="line2">Address line 2</FieldLabel>
              <Input id="line2" {...form.register("line2")} />
            </Field>
            <Field data-invalid={form.formState.errors.city ? true : undefined}>
              <FieldLabel htmlFor="city">City</FieldLabel>
              <Input id="city" aria-invalid={Boolean(form.formState.errors.city)} {...form.register("city")} />
              <FieldError errors={[form.formState.errors.city]} />
            </Field>
            <Field data-invalid={form.formState.errors.state ? true : undefined}>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <Input id="state" aria-invalid={Boolean(form.formState.errors.state)} {...form.register("state")} />
              <FieldError errors={[form.formState.errors.state]} />
            </Field>
            <Field data-invalid={form.formState.errors.postalCode ? true : undefined}>
              <FieldLabel htmlFor="postalCode">Postal code</FieldLabel>
              <Input id="postalCode" aria-invalid={Boolean(form.formState.errors.postalCode)} {...form.register("postalCode")} />
              <FieldError errors={[form.formState.errors.postalCode]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAddress.isPending}>
              {createAddress.isPending ? "Saving..." : "Add address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
