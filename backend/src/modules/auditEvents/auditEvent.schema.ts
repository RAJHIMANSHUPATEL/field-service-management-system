import { z } from "zod";
import { pageQuerySchema } from "../../lib/pagination.js";

export const listAuditEventsQuerySchema = pageQuerySchema.extend({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});

export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>;
