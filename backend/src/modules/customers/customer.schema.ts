import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

const optionalText = z.string().trim().min(1).optional();

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  phone: optionalText,
  email: z.email().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  email: z.email().nullable().optional(),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  phone: optionalText,
  password: z.string().min(8).optional(),
});

export const updateContactSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.email().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
});

export const createAddressSchema = z.object({
  label: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: optionalText,
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  isPrimary: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const listCustomersQuerySchema = pageQuerySchema;

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
