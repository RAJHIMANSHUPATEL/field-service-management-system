import { Link } from "react-router-dom";
import { recordLinkClassName } from "@/components/content";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/features/invoices/api/invoices.api";
import { workOrderStatusLabel, type WorkOrderStatus } from "@/lib/status";
import { useDashboard } from "../hooks/useAnalytics";

function Stat({ label, value, detail, to }: { label: string; value: string | number; detail: string; to: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Link to={to}>{value}</Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  const dashboard = useDashboard();
  if (dashboard.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (dashboard.isError || !dashboard.data) {
    return <p className="text-sm text-destructive">Could not load the dashboard.</p>;
  }
  const data = dashboard.data;
  const busiest = Object.entries(data.activeJobs.byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${workOrderStatusLabel(status as WorkOrderStatus)} ${count}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active jobs" value={data.activeJobs.total} detail={busiest || "Nothing in progress."} to="/work-orders" />
        <Stat label="Delayed visits" value={data.delayedVisits.count} detail={data.delayedVisits.rule} to="/schedule" />
        <Stat
          label="Unassigned"
          value={data.unassignedQueue.count}
          detail={`${data.unassignedQueue.awaitingTriage} request${data.unassignedQueue.awaitingTriage === 1 ? "" : "s"} awaiting triage`}
          to="/work-orders"
        />
        <Stat
          label="Pending invoices"
          value={data.pendingInvoices.count}
          detail={`${formatMoney(data.pendingInvoices.outstanding, data.pendingInvoices.currency)} outstanding · ${data.pendingInvoices.overdue} overdue · ${data.pendingInvoices.drafts} drafts${
            data.pendingInvoices.refundDueCount > 0
              ? ` · ${formatMoney(data.pendingInvoices.refundDue, data.pendingInvoices.currency)} refund due`
              : ""
          }`}
          to="/invoices"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Delayed visits</CardTitle>
            <CardDescription>Oldest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.delayedVisits.items.length === 0 ? <p className="text-sm text-muted-foreground">No delays.</p> : null}
            <ul className="flex flex-col gap-2" aria-label="Delayed visits">
              {data.delayedVisits.items.map((row) => (
                <li key={row.visitId} className="text-sm">
                  <Link className={recordLinkClassName} to={`/work-orders/${row.workOrderId}`}>
                    {row.customer}
                  </Link>{" "}
                  · {row.technician} · planned {when(row.scheduledStart)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unassigned queue</CardTitle>
            <CardDescription>Work orders waiting for a technician, oldest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.unassignedQueue.items.length === 0 ? <p className="text-sm text-muted-foreground">Queue is empty.</p> : null}
            <ul className="flex flex-col gap-2" aria-label="Unassigned queue">
              {data.unassignedQueue.items.map((row) => (
                <li key={row.workOrderId} className="text-sm">
                  <Link className={recordLinkClassName} to={`/work-orders/${row.workOrderId}`}>
                    {row.customer} · {row.equipment}
                  </Link>{" "}
                  · {row.priority.toLowerCase()} · since {when(row.createdAt)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.visitsToday} visits today · {data.completedJobs} jobs completed in total · updated {when(data.generatedAt)}
      </p>
    </div>
  );
}
