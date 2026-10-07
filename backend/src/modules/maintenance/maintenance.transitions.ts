// A plan is active (it generates work when due) or paused; nothing else.
export type PlanAction = "pause" | "resume";

export const planTransitions: Record<PlanAction, { from: boolean; to: boolean }> = {
  pause: { from: true, to: false },
  resume: { from: false, to: true },
};

// A generated job still counts as open until it is completed; the plan waits for it.
export const openWorkOrderStatuses = ["OPEN", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "AWAITING_PARTS", "FOLLOW_UP_REQUIRED"] as const;

export const DAY_MS = 86_400_000;

export function nextDueAfter(completedAt: Date, intervalDays: number) {
  const day = new Date(Date.UTC(completedAt.getUTCFullYear(), completedAt.getUTCMonth(), completedAt.getUTCDate()));
  return new Date(day.getTime() + intervalDays * DAY_MS);
}

export function isDue(plan: { isActive: boolean; nextDueOn: Date; leadDays: number }, now: Date) {
  return plan.isActive && plan.nextDueOn.getTime() - plan.leadDays * DAY_MS <= now.getTime();
}
