import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { selectClassName } from "@/components/content";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTechnicians } from "@/features/technicians/hooks/useTechnicians";
import { toastError } from "@/lib/toastError";
import type { Catalog, Part, ServiceArea, Skill, Warehouse } from "../api/masterData.api";
import { useCatalog, useCreateCatalogItem, useToggleCatalogItem } from "../hooks/useMasterData";
import { partSchema, serviceAreaSchema, skillSchema, warehouseSchema } from "../schemas/masterData.schema";

type FieldSpec = {
  name: string;
  label: string;
  initial: string;
  options?: { value: string; label: string }[];
  showWhen?: (values: Record<string, string>) => boolean;
};

type Column<T> = { label: string; cell: (row: T) => ReactNode };

function CatalogCard<T extends { id: string; isActive: boolean }>({
  catalog,
  title,
  description,
  noun,
  fields,
  schema,
  columns,
}: {
  catalog: Catalog;
  title: string;
  description: string;
  noun: string;
  fields: FieldSpec[];
  schema: z.ZodType<unknown, Record<string, string>>;
  columns: Column<T>[];
}) {
  const rows = useCatalog<T>(catalog);
  const create = useCreateCatalogItem(catalog);
  const toggle = useToggleCatalogItem(catalog);
  const initial = Object.fromEntries(fields.map((field) => [field.name, field.initial]));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function close() {
    setValues(initial);
    setErrors({});
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Add {noun}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {rows.isError ? <p className="text-sm text-destructive">Could not load {title.toLowerCase()}.</p> : null}
        {rows.data?.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : null}
        {rows.data && rows.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.label}>{column.label}</TableHead>
                ))}
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.data.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.label}>{column.cell(row)}</TableCell>
                  ))}
                  <TableCell>
                    <button
                      type="button"
                      aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${noun}`}
                      onClick={() =>
                        toggle.mutate(
                          { id: row.id, isActive: !row.isActive },
                          { onError: (error) => toastError(error, `Could not update the ${noun}`) },
                        )
                      }
                    >
                      <Badge variant={row.isActive ? "secondary" : "outline"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = schema.safeParse(values);
              if (!parsed.success) {
                setErrors(
                  Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
                );
                return;
              }
              create.mutate(parsed.data, {
                onSuccess: () => {
                  toast.success(`${noun[0]?.toUpperCase()}${noun.slice(1)} added`);
                  close();
                },
                onError: (error) => toastError(error, `Could not add the ${noun}`),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add {noun}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {fields
                .filter((field) => !field.showWhen || field.showWhen(values))
                .map((field) => {
                  const id = `${catalog}-${field.name}`;
                  const onChange = (value: string) => setValues({ ...values, [field.name]: value });
                  return (
                    <Field key={field.name} data-invalid={errors[field.name] ? true : undefined}>
                      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                      {field.options ? (
                        <select
                          id={id}
                          className={selectClassName}
                          value={values[field.name]}
                          onChange={(event) => onChange(event.target.value)}
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input id={id} value={values[field.name]} onChange={(event) => onChange(event.target.value)} />
                      )}
                      <FieldError errors={errors[field.name] ? [{ message: errors[field.name] }] : []} />
                    </Field>
                  );
                })}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Saving..." : `Add ${noun}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function MasterDataPage() {
  const technicians = useTechnicians();
  const technicianOptions = [
    { value: "", label: "Choose a technician" },
    ...(technicians.data ?? []).map((technician) => ({ value: technician.id, label: technician.user.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <CatalogCard<Skill>
        catalog="skills"
        title="Skills"
        description="What technicians are qualified to do."
        noun="skill"
        schema={skillSchema}
        fields={[{ name: "name", label: "Name", initial: "" }]}
        columns={[{ label: "Name", cell: (row) => row.name }]}
      />
      <CatalogCard<ServiceArea>
        catalog="service-areas"
        title="Service areas"
        description="Postal codes a team covers, separated by commas."
        noun="service area"
        schema={serviceAreaSchema}
        fields={[
          { name: "name", label: "Name", initial: "" },
          { name: "postalCodes", label: "Postal codes", initial: "" },
        ]}
        columns={[
          { label: "Name", cell: (row) => row.name },
          { label: "Postal codes", cell: (row) => row.postalCodes.join(", ") },
        ]}
      />
      <CatalogCard<Part>
        catalog="parts"
        title="Parts catalogue"
        description="Parts the company stocks and bills."
        noun="part"
        schema={partSchema}
        fields={[
          { name: "sku", label: "SKU", initial: "" },
          { name: "name", label: "Name", initial: "" },
          { name: "unitPrice", label: "Unit price", initial: "" },
          { name: "currency", label: "Currency", initial: "INR" },
        ]}
        columns={[
          { label: "SKU", cell: (row) => <span className="font-mono text-xs">{row.sku}</span> },
          { label: "Name", cell: (row) => row.name },
          { label: "Price", cell: (row) => `${row.currency} ${Number(row.unitPrice).toFixed(2)}` },
        ]}
      />
      <CatalogCard<Warehouse>
        catalog="warehouses"
        title="Warehouses and vans"
        description="Where stock is kept. A van belongs to one technician."
        noun="location"
        schema={warehouseSchema}
        fields={[
          { name: "name", label: "Name", initial: "" },
          {
            name: "kind",
            label: "Kind",
            initial: "WAREHOUSE",
            options: [
              { value: "WAREHOUSE", label: "Warehouse" },
              { value: "VAN", label: "Van" },
            ],
          },
          {
            name: "technicianId",
            label: "Technician",
            initial: "",
            options: technicianOptions,
            showWhen: (values) => values.kind === "VAN",
          },
        ]}
        columns={[
          { label: "Name", cell: (row) => row.name },
          { label: "Kind", cell: (row) => (row.kind === "VAN" ? "Van" : "Warehouse") },
          { label: "Technician", cell: (row) => row.technician?.user.name ?? "—" },
        ]}
      />
    </div>
  );
}
