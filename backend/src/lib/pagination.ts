import { z } from "zod";

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    pageCount: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
