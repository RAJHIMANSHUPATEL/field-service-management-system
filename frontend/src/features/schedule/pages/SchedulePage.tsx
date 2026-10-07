import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { recordLinkClassName, selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useTechnicians } from "@/features/technicians/hooks/useTechnicians";
import { useAddTimeOff, useCalendar } from "@/features/workOrders/hooks/useWorkOrders";
import { visitStatusLabel } from "@/lib/status";
import { toastError } from "@/lib/toastError";

const DAY = 24 * 60 * 60_000;

function startOfWeek(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clock(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SchedulePage() {
  const currentUser = useCurrentUser();
  const isPlanner = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [technicianId, setTechnicianId] = useState("");
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const technicians = useTechnicians();
  const from = weekStart.toISOString();
  const to = new Date(weekStart.getTime() + 7 * DAY).toISOString();
  const calendar = useCalendar(from, to, technicianId);
  const days = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getTime() + index * DAY));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isPlanner ? "Scheduling" : "My schedule"}</CardTitle>
        <CardDescription>
          Week of {weekStart.toLocaleDateString(undefined, { dateStyle: "medium" })}. Visits and time off.
        </CardDescription>
        {isPlanner ? (
          <CardAction>
            <Button type="button" variant="outline" onClick={() => setTimeOffOpen(true)}>
              Add time off
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}>
            Previous week
          </Button>
          <Button type="button" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </Button>
          <Button type="button" variant="outline" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}>
            Next week
          </Button>
          <Input
            type="date"
            aria-label="Go to week"
            className="max-w-44"
            onChange={(event) => {
              if (event.target.value) {
                setWeekStart(startOfWeek(new Date(`${event.target.value}T12:00:00`)));
              }
            }}
          />
          {isPlanner ? (
            <select
              aria-label="Technician"
              className={`${selectClassName} max-w-56`}
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
            >
              <option value="">All technicians</option>
              {(technicians.data ?? []).map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.user.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {calendar.isPending ? <Skeleton className="h-40 w-full" /> : null}
        {calendar.isError ? <p className="text-sm text-destructive">Could not load the schedule.</p> : null}
        {calendar.data ? (
          <div className="grid gap-3 md:grid-cols-7">
            {days.map((day) => {
              const visits = calendar.data.visits.filter((visit) => sameDay(new Date(visit.scheduledStart), day));
              const off = calendar.data.timeOff.filter(
                (row) => new Date(row.startsAt).getTime() < day.getTime() + DAY && new Date(row.endsAt).getTime() > day.getTime(),
              );
              return (
                <section key={day.toISOString()} className="flex min-h-24 flex-col gap-2 rounded-lg border p-2" aria-label={day.toDateString()}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                    {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </h3>
                  {off.map((row) => (
                    <p key={row.id} className="rounded bg-muted px-2 py-1 text-xs">
                      {row.technician.user.name} off{row.reason ? ` · ${row.reason}` : ""}
                    </p>
                  ))}
                  {visits.map((visit) => (
                    <Link
                      key={visit.id}
                      to={`/work-orders/${visit.workOrder.id}`}
                      className={`${recordLinkClassName} flex flex-col gap-1 rounded border px-2 py-1 text-xs`}
                    >
                      <span className="font-medium">
                        {clock(visit.scheduledStart)} · {visit.workOrder.asset.equipmentType}
                      </span>
                      <span className="text-muted-foreground">
                        {visit.workOrder.customer.name} · {visit.technician.user.name}
                      </span>
                      <Badge variant="secondary">{visitStatusLabel(visit.status)}</Badge>
                    </Link>
                  ))}
                </section>
              );
            })}
          </div>
        ) : null}
      </CardContent>
      {timeOffOpen ? <TimeOffDialog onClose={() => setTimeOffOpen(false)} /> : null}
    </Card>
  );
}

function TimeOffDialog({ onClose }: { onClose: () => void }) {
  const technicians = useTechnicians();
  const add = useAddTimeOff();
  const [technicianId, setTechnicianId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const ready = technicianId && startsAt && endsAt;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) {
              return;
            }
            add.mutate(
              {
                technicianId,
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              },
              {
                onSuccess: () => {
                  toast.success("Time off added");
                  onClose();
                },
                onError: (error) => toastError(error, "Could not add the time off"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Add time off</DialogTitle>
            <DialogDescription>The technician cannot be booked in this time.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="off-technician">Technician</FieldLabel>
              <select
                id="off-technician"
                className={selectClassName}
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Choose a technician</option>
                {(technicians.data ?? []).map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.user.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="off-start">From</FieldLabel>
              <Input id="off-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="off-end">To</FieldLabel>
              <Input id="off-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="off-reason">Reason</FieldLabel>
              <Input id="off-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending || !ready}>
              {add.isPending ? "Saving..." : "Add time off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
