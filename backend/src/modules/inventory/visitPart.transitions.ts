import type { VisitPartStatus } from "../../generated/prisma/client.js";

export type VisitPartAction = "consume" | "release" | "return";

// Each action moves a visit part from one status to the next, with its effect on stock.
export const visitPartTransitions: Record<
  VisitPartAction,
  { from: VisitPartStatus; to: VisitPartStatus; kind: "CONSUMED" | "RELEASED" | "RETURNED" }
> = {
  consume: { from: "RESERVED", to: "CONSUMED", kind: "CONSUMED" },
  release: { from: "RESERVED", to: "RELEASED", kind: "RELEASED" },
  return: { from: "CONSUMED", to: "RETURNED", kind: "RETURNED" },
};

// Stock effect of each action for a quantity q: consume takes it off the shelf and the
// reservation, release only frees the reservation, return puts it back on the shelf.
export function stockEffect(action: VisitPartAction, quantity: number) {
  switch (action) {
    case "consume":
      return { onHandDelta: -quantity, reservedDelta: -quantity };
    case "release":
      return { onHandDelta: 0, reservedDelta: -quantity };
    case "return":
      return { onHandDelta: quantity, reservedDelta: 0 };
  }
}

export function canMoveVisitPart(action: VisitPartAction, current: VisitPartStatus) {
  return visitPartTransitions[action].from === current;
}
