import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const assetStatus = z.enum(["ACTIVE", "OUT_OF_SERVICE", "DECOMMISSIONED"]);

export const listAssetsQuerySchema = pageQuerySchema.extend({
  customerId: z.string().min(1).optional(),
});

export const createAssetSchema = z.object({
  customerId: z.string().min(1),
  addressId: z.string().min(1),
  equipmentType: z.string().trim().min(1),
  model: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1),
  installedAt: dateOnly.optional(),
  warrantyExpiresAt: dateOnly.optional(),
  status: assetStatus.optional(),
});

export const updateAssetSchema = createAssetSchema
  .omit({ customerId: true })
  .partial()
  .extend({
    status: assetStatus.optional(),
  });

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export function toDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  return new Date(`${value}T00:00:00.000Z`);
}
