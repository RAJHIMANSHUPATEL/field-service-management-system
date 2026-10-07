import { Link } from "react-router-dom";
import { priorityLabel } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { visitStatusLabel, workOrderStatusLabel } from "@/lib/status";
import type { WorkOrder } from "../api/workOrders.api";
import { useWorkOrders } from "../hooks/useWorkOrders";

const groups: { title: string; statuses: WorkOrder["status"][] }[] = [
  { title: "In progress", statuses: ["IN_PROGRESS"] },
  { title: "Upcoming", statuses: ["ACCEPTED", "ASSIGNED"] },
  { title: "Completed", statuses: ["COMPLETED"] },
];

function nextVisit(workOrder: WorkOrder) {
  return workOrder.visits.find((visit) => visit.status !== "CANCELLED" && visit.status !== "COMPLETED") ?? null;
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Phone-first list of the technician's own jobs, active work first, soonest visit first.
export function MyJobsPage() {
  const workOrders = useWorkOrders();
  const rows = workOrders.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>My jobs</CardTitle>
        <CardDescription>Tap a job to move it along on site.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {workOrders.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {workOrders.isError ? <p className="text-sm text-destructive">Could not load your jobs.</p> : null}
        {workOrders.data?.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No jobs yet</EmptyTitle>
              <EmptyDescription>Jobs show here after they are assigned to you.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {groups.map((group) => {
          const items = rows
            .filter((row) => group.statuses.includes(row.status))
            .sort((a, b) => (nextVisit(a)?.scheduledStart ?? "9").localeCompare(nextVisit(b)?.scheduledStart ?? "9"));
          if (items.length === 0) {
            return null;
          }
          return (
            <section key={group.title} className="flex flex-col gap-2" aria-label={group.title}>
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h2>
              <ul className="flex flex-col gap-2">
                {items.map((row) => {
                  const visit = nextVisit(row);
                  return (
                    <li key={row.id}>
                      <Link
                        to={`/work-orders/${row.id}`}
                        className="flex min-h-16 flex-col gap-1 rounded-lg border px-3 py-3 hover:bg-muted/60"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{row.customer.name}</span>
                          <Badge variant={row.status === "COMPLETED" ? "secondary" : "default"}>
                            {visit ? visitStatusLabel(visit.status) : workOrderStatusLabel(row.status)}
                          </Badge>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {row.asset.equipmentType} · {row.serviceType.name} · {priorityLabel(row.priority)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {row.address.line1}, {row.address.city}
                        </span>
                        {visit ? <span className="text-sm font-medium">{when(visit.scheduledStart)}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
