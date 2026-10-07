import { api } from "@/lib/apiClient";

export type Dashboard = {
  generatedAt: string;
  activeJobs: { total: number; byStatus: Record<string, number> };
  delayedVisits: {
    count: number;
    rule: string;
    items: { visitId: string; workOrderId: string; scheduledStart: string; technician: string; customer: string }[];
  };
  unassignedQueue: {
    count: number;
    oldestCreatedAt: string | null;
    awaitingTriage: number;
    items: { workOrderId: string; createdAt: string; priority: string; customer: string; equipment: string }[];
  };
  pendingInvoices: { count: number; overdue: number; drafts: number; outstanding: string; currency: string };
  visitsToday: number;
  completedJobs: number;
};

export type Metrics = {
  jobsCompleted: number;
  jobsPending: number;
  firstVisitResolutionPercent: number | null;
  repeatVisitJobs: number;
  averageServiceMinutes: number | null;
  averageCompletionHours: number | null;
  averageRating: number | null;
  ratings: number;
  cancelledVisits: number;
  partsConsumed: number;
};

export type Performance = {
  data: ({ technician: { id: string; name: string; isActive: boolean } } & Metrics)[];
  meta: { from: string; to: string; team: Metrics };
};

export function getDashboard() {
  return api<{ data: Dashboard }>("/api/v1/analytics/dashboard").then((result) => result.data);
}

export function getPerformance(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return api<Performance>(`/api/v1/analytics/technicians?from=${from.toISOString()}&to=${to.toISOString()}`);
}
