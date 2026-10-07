// Metric definitions (README §4.17, ADR 0005). Pure functions over plain rows, so the API and
// the tests compute the same numbers the same way.

export const activeStatuses = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "AWAITING_PARTS", "FOLLOW_UP_REQUIRED"] as const;
export const DELAY_MINUTES = 30;

export type CompletedJob = {
  workOrderId: string;
  technicianId: string;
  createdAt: Date;
  completedAt: Date;
  // Visits that reached the site (arrived), whatever their outcome.
  onSiteVisits: number;
  rating: number | null;
};

export type ServiceVisitTime = { technicianId: string; startedAt: Date; completedAt: Date };

function mean(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, places = 1) {
  if (value === null) {
    return null;
  }
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function technicianMetrics(input: {
  completedJobs: CompletedJob[];
  serviceVisits: ServiceVisitTime[];
  pendingJobs: number;
  cancelledVisits: number;
  partsConsumed: number;
}) {
  const jobs = input.completedJobs;
  const firstVisit = jobs.filter((job) => job.onSiteVisits <= 1).length;
  const ratings = jobs.map((job) => job.rating).filter((value): value is number => value !== null);
  return {
    jobsCompleted: jobs.length,
    jobsPending: input.pendingJobs,
    // Completed jobs fixed on the only visit that reached the site / completed jobs.
    firstVisitResolutionPercent: jobs.length === 0 ? null : Math.round((firstVisit / jobs.length) * 100),
    // Completed jobs that needed more than one on-site visit.
    repeatVisitJobs: jobs.length - firstVisit,
    // Start to completion of each completed visit, in minutes.
    averageServiceMinutes: round(mean(input.serviceVisits.map((visit) => (visit.completedAt.getTime() - visit.startedAt.getTime()) / 60_000)), 0),
    // Work order created to job completed, in hours.
    averageCompletionHours: round(mean(jobs.map((job) => (job.completedAt.getTime() - job.createdAt.getTime()) / 3_600_000))),
    averageRating: round(mean(ratings), 2),
    ratings: ratings.length,
    cancelledVisits: input.cancelledVisits,
    partsConsumed: input.partsConsumed,
  };
}
