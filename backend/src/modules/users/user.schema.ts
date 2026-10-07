import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listUsersQuerySchema = pageQuerySchema;

// Technicians are created from the technician screen and customer logins from customer contacts,
// so invitations are for staff roles only.
export const createInvitationSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1),
  role: z.enum(["ADMIN", "OPS"]),
});

export const invitationParamsSchema = z.object({ id: z.string().min(1) });

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
