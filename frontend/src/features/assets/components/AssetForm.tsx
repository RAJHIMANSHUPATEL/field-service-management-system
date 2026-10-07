import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { selectClassName } from "@/components/content";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Address, CustomerAsset } from "@/features/customers/api/customers.api";
import { blankToUndefined } from "@/lib/blankToUndefined";
import { toastError } from "@/lib/toastError";
import { useSaveAsset } from "../hooks/useAssets";
import { assetFormSchema, type AssetFormInput } from "../schemas/asset.schema";

function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function formValues(asset: CustomerAsset | undefined, addresses: Address[]): AssetFormInput {
  return {
    addressId: asset?.addressId ?? addresses[0]?.id ?? "",
    equipmentType: asset?.equipmentType ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    installedAt: dateValue(asset?.installedAt),
    warrantyExpiresAt: dateValue(asset?.warrantyExpiresAt),
    status: asset?.status ?? "ACTIVE",
  };
}

export function AssetForm({
  customerId,
  addresses,
  asset,
  onDone,
}: {
  customerId: string;
  addresses: Address[];
  asset?: CustomerAsset;
  onDone: () => void;
}) {
  const saveAsset = useSaveAsset(customerId);
  const form = useForm<AssetFormInput>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: formValues(asset, addresses),
  });

  useEffect(() => {
    form.reset(formValues(asset, addresses));
  }, [asset, addresses, form]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        saveAsset.mutate(
          {
            id: asset?.id,
            customerId,
            addressId: values.addressId,
            equipmentType: values.equipmentType,
            model: values.model,
            serialNumber: values.serialNumber,
            installedAt: blankToUndefined(values.installedAt),
            warrantyExpiresAt: blankToUndefined(values.warrantyExpiresAt),
            status: values.status,
          },
          {
            onSuccess: () => {
              toast.success(asset ? "Asset saved" : "Asset added");
              onDone();
            },
            onError: (error) => toastError(error, "Could not save the asset"),
          },
        );
      })}
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
        <DialogDescription>Equipment at one of this customer's addresses.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={form.formState.errors.addressId ? true : undefined}>
          <FieldLabel htmlFor="addressId">Address</FieldLabel>
          <select
            id="addressId"
            className={selectClassName}
            aria-invalid={Boolean(form.formState.errors.addressId)}
            {...form.register("addressId")}
          >
            {addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label}
              </option>
            ))}
          </select>
          <FieldError errors={[form.formState.errors.addressId]} />
        </Field>
        <Field data-invalid={form.formState.errors.equipmentType ? true : undefined}>
          <FieldLabel htmlFor="equipmentType">Equipment type</FieldLabel>
          <Input id="equipmentType" aria-invalid={Boolean(form.formState.errors.equipmentType)} {...form.register("equipmentType")} />
          <FieldError errors={[form.formState.errors.equipmentType]} />
        </Field>
        <Field data-invalid={form.formState.errors.model ? true : undefined}>
          <FieldLabel htmlFor="model">Model</FieldLabel>
          <Input id="model" aria-invalid={Boolean(form.formState.errors.model)} {...form.register("model")} />
          <FieldError errors={[form.formState.errors.model]} />
        </Field>
        <Field data-invalid={form.formState.errors.serialNumber ? true : undefined}>
          <FieldLabel htmlFor="serialNumber">Serial number</FieldLabel>
          <Input id="serialNumber" aria-invalid={Boolean(form.formState.errors.serialNumber)} {...form.register("serialNumber")} />
          <FieldError errors={[form.formState.errors.serialNumber]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="installedAt">Installed</FieldLabel>
          <Input id="installedAt" type="date" {...form.register("installedAt")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="warrantyExpiresAt">Warranty expires</FieldLabel>
          <Input id="warrantyExpiresAt" type="date" {...form.register("warrantyExpiresAt")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <select id="status" className={selectClassName} {...form.register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="OUT_OF_SERVICE">Out of service</option>
            <option value="DECOMMISSIONED">Decommissioned</option>
          </select>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveAsset.isPending || addresses.length === 0}>
          {saveAsset.isPending ? "Saving..." : asset ? "Save asset" : "Add asset"}
        </Button>
      </DialogFooter>
    </form>
  );
}
