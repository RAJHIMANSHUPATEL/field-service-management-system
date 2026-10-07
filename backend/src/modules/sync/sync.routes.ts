import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { workOrderInclude } from "../workOrders/workOrder.service.js";

// Delta sync for the technician app: everything about my jobs that changed since `since`.
// The client stores `serverTime` and sends it back as the next `since`; timestamps are UTC.
export const syncQuerySchema = z.object({ since: z.iso.datetime().optional() });

const SYNC_PAGE = 500;

export const syncRouter = Router();

syncRouter.get("/technician", requireAuth, requireRole("TECHNICIAN"), async (req: Request, res: Response) => {
  const { since } = syncQuerySchema.parse(req.query);
  const user = req.user!;
  const serverTime = new Date();
  const changed = since ? new Date(since) : new Date(0);
  const workOrders = await prisma.workOrder.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { technician: { userId: user.id }, updatedAt: { gt: changed } },
        { visits: { some: { technician: { userId: user.id }, updatedAt: { gt: changed } } } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: SYNC_PAGE + 1,
    include: workOrderInclude,
  });
  // More than a page changed: return a page and a cursor at its last row so nothing is skipped.
  const hasMore = workOrders.length > SYNC_PAGE;
  const page = hasMore ? workOrders.slice(0, SYNC_PAGE) : workOrders;
  const next = hasMore ? page[page.length - 1]!.updatedAt : serverTime;
  res.status(200).json({ data: { serverTime: next.toISOString(), hasMore, full: !since, workOrders: page } });
});
