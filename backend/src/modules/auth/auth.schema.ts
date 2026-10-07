import { z } from "zod";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export const passwordSchema = z.string().min(8);

export const requestPasswordResetSchema = z.object({
  email: z.email(),
});

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const registerOrganizationSchema = z.object({
  organizationName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.email(),
  password: passwordSchema,
});

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
