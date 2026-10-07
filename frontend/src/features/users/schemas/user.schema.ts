import { z } from "zod";

export const inviteSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  role: z.enum(["ADMIN", "OPS"]),
});

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

export type InviteInput = z.infer<typeof inviteSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
