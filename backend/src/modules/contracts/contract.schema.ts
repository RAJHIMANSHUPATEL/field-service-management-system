import { z } from "zod";

const percent = z.number().int().min(0).max(100);

export const createContractSchema = z
  .object({
    customerId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    assetIds: z.array(z.string().min(1)).min(1).max(200),
    serviceChargeCoveredPercent: percent.default(100),
    labourCoveredPercent: percent.default(100),
    partsCoveredPercent: percent.default(0),
  })
  .refine((value) => value.endsOn >= value.startsOn, { message: "The contract must end on or after it starts", path: ["endsOn"] });

export const listContractsQuerySchema = z.object({ customerId: z.string().min(1).optional() });
export const cancelContractSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export type CreateContractInput = z.infer<typeof createContractSchema>;
