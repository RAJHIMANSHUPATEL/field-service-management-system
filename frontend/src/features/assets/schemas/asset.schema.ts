import { z } from "zod";

const optionalDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date")]);

export const assetFormSchema = z.object({
  addressId: z.string().min(1, "Choose an address"),
  equipmentType: z.string().trim().min(1, "Equipment type is required"),
  model: z.string().trim().min(1, "Model is required"),
  serialNumber: z.string().trim().min(1, "Serial number is required"),
  installedAt: optionalDate,
  warrantyExpiresAt: optionalDate,
  status: z.enum(["ACTIVE", "OUT_OF_SERVICE", "DECOMMISSIONED"]),
});

export type AssetFormInput = z.infer<typeof assetFormSchema>;
