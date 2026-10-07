import type { PartRequestStatus } from "../../generated/prisma/client.js";

export type PartRequestAction = "fulfil" | "cancel";

export const partRequestTransitions: Record<PartRequestAction, { from: PartRequestStatus; to: PartRequestStatus }> = {
  fulfil: { from: "OPEN", to: "FULFILLED" },
  cancel: { from: "OPEN", to: "CANCELLED" },
};
