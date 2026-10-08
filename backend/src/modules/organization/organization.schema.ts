import { z } from "zod";
import { resolveGstState } from "../../lib/gstStates.js";

// Accepts a GST state code ("29"), abbreviation ("KA") or name ("Karnataka"); stores the code.
export const gstStateSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const state = resolveGstState(value);
    if (!state) {
      ctx.addIssue({ code: "custom", message: "Not a recognised Indian state or union territory" });
      return z.NEVER;
    }
    return state.code;
  });

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  gstState: gstStateSchema.optional(),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
