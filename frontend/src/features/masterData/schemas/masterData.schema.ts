import { z } from "zod";

export const skillSchema = z.object({ name: z.string().trim().min(1, "Name is required") });

export const serviceAreaSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  postalCodes: z
    .string()
    .trim()
    .min(1, "Add at least one postal code")
    .transform((value) => value.split(/[\s,]+/).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[A-Za-z0-9 -]{3,10}$/, "Use postal codes like 78701")).min(1)),
});

export const partSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  name: z.string().trim().min(1, "Name is required"),
  unitPrice: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use an amount like 1250.00"),
  currency: z.string().trim().length(3, "Use a 3-letter code like INR"),
  reorderLevel: z
    .string()
    .regex(/^\d{0,6}$/, "Use a whole number")
    .transform((value) => (value === "" ? 0 : Number(value))),
});

export const warehouseSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    kind: z.enum(["WAREHOUSE", "VAN"]),
    technicianId: z.string(),
  })
  .refine((value) => value.kind === "WAREHOUSE" || value.technicianId, {
    message: "Choose the technician who drives this van",
    path: ["technicianId"],
  })
  .transform((value) => ({
    name: value.name,
    kind: value.kind,
    ...(value.kind === "VAN" ? { technicianId: value.technicianId } : {}),
  }));

export const registerSchema = z.object({
  organizationName: z.string().trim().min(1, "Company name is required"),
  name: z.string().trim().min(1, "Your name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
