import { z } from "zod";

const optionalText = z.string().trim().min(1).optional().or(z.literal(""));

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: optionalText,
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  phone: optionalText,
  password: z.union([z.literal(""), z.string().min(8, "Use at least 8 characters")]),
});

export const createAddressSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  line1: z.string().trim().min(1, "Address is required"),
  line2: optionalText,
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
