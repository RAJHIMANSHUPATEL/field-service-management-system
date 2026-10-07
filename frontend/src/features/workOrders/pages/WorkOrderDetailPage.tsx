import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { FactList, NoteThread, priorityLabel, selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toastError } from "@/lib/toastError";
import type { VisitStatus, WorkOrderStatus } from "../api/workOrders.api";
import {
  useAcceptWorkOrder,
  useAssignWorkOrder,
  useDeclineWorkOrder,
  useScheduleWorkOrder,
  useWorkOrder,
} from "../hooks/useWorkOrders";

function dateLabel(value: string) {
  return value.slice(0, 10);
}

function statusLabel(status: WorkOrderStatus) {
  if (status === "ASSIGNED") {
    return "Assigned";
  }
  if (status === "ACCEPTED") {
    return "Accepted";
  }
  return "Open";
}

function statusVariant(status: WorkOrderStatus) {
  if (status === "ACCEPTED") {
    return "default" as const;
  }
  if (status === "ASSIGNED") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function visitStatusLabel(status: VisitStatus) {
  return status === "SCHEDULED" ? "Scheduled" : "Cancelled";
}

function visitTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function WorkOrderDetailPage() {
  const { workOrderId = "" } = useParams();
  const currentUser = useCurrentUser();
  const workOrder = useWorkOrder(workOrderId);
  const canAssign = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const [assignOpen, setAssignOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const accept = useAcceptWorkOrder(workOrderId);

  if (workOrder.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (workOrder.isError || !workOrder.data) {
    return <p className="text-sm text-destructive">Could not load this work order.</p>;
  }

  const record = workOrder.data;
  const hasScheduledVisit = record.visits.some((visit) => visit.status === "SCHEDULED");
  const isAssignee =
    currentUser.data?.role === "TECHNICIAN" && record.technician?.user.id === currentUser.data.id;
  const showAssign = canAssign && record.status !== "ACCEPTED" && !hasScheduledVisit;
  const showSchedule = canAssign && record.status === "ASSIGNED" && !hasScheduledVisit;
  const showAccept = isAssignee && record.status === "ASSIGNED" && hasScheduledVisit;
  const showDecline = isAssignee && record.status === "ASSIGNED";

  const showActions = canAssign || showAssign || showSchedule || showAccept || showDecline;

  return (
    <div className="flex flex-col gap-4">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(record.status)}>{statusLabel(record.status)}</Badge>
          <Badge variant="outline">{priorityLabel(record.priority)}</Badge>
        </div>
        <CardTitle>{record.asset.equipmentType}</CardTitle>
        <CardDescription>{record.asset.serialNumber}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-lg border bg-muted/60 px-3 py-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Problem</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{record.description}</p>
        </div>
        <FactList
          items={[
            { label: "Customer", value: record.customer.name },
            { label: "Service", value: record.serviceType.name },
            {
              label: "Preferred window",
              value: `${dateLabel(record.request.preferredStart)} – ${dateLabel(record.request.preferredEnd)}`,
            },
            {
              label: "Address",
              value: `${record.address.label}, ${record.address.line1}, ${record.address.city}, ${record.address.state} ${record.address.postalCode}`,
            },
            {
              label: "Technician",
              value: record.technician ? record.technician.user.name : "No technician assigned",
            },
          ]}
        />
        {record.visits.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Visits</p>
            <ul className="flex flex-col gap-2">
              {record.visits.map((visit) => (
                <li key={visit.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{visitTime(visit.scheduledStart)}</span>
                  <Badge variant={visit.status === "SCHEDULED" ? "default" : "outline"}>{visitStatusLabel(visit.status)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      {showActions ? (
        <CardFooter className="flex-wrap gap-2">
          {canAssign ? (
            <Button variant="outline" nativeButton={false} render={<Link to={`/requests/${record.request.id}`} />}>
              View request
            </Button>
          ) : null}
          {showAccept ? (
            <Button
              type="button"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: () => toast.success("Job accepted"),
                  onError: (error) => toastError(error, "Could not accept the job"),
                })
              }
            >
              {accept.isPending ? "Saving..." : "Accept"}
            </Button>
          ) : null}
          {showDecline ? (
            <Button type="button" variant="destructive" onClick={() => setDeclineOpen(true)}>
              Decline
            </Button>
          ) : null}
          {showSchedule ? (
            <Button type="button" onClick={() => setScheduleOpen(true)}>
              Schedule
            </Button>
          ) : null}
          {showAssign ? (
            <Button type="button" variant={showSchedule ? "outline" : "default"} onClick={() => setAssignOpen(true)}>
              Assign
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
      {showAssign ? <AssignDialog workOrderId={record.id} open={assignOpen} onOpenChange={setAssignOpen} /> : null}
      {showSchedule ? (
        <ScheduleDialog workOrderId={record.id} open={scheduleOpen} onOpenChange={setScheduleOpen} />
      ) : null}
      {showDecline ? <DeclineDialog workOrderId={record.id} open={declineOpen} onOpenChange={setDeclineOpen} /> : null}
    </Card>
    {record.notes.length > 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Reasons recorded when a technician declines the job.</CardDescription>
        </CardHeader>
        <CardContent>
          <NoteThread
            notes={record.notes.map((note) => ({
              id: note.id,
              author: note.author.name,
              body: note.body,
              createdAt: note.createdAt,
            }))}
          />
        </CardContent>
      </Card>
    ) : null}
    </div>
  );
}

function AssignDialog({
  workOrderId,
  open,
  onOpenChange,
}: {
  workOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const technicians = useTechnicians();
  const assign = useAssignWorkOrder(workOrderId);
  const active = technicians.data?.filter((technician) => technician.isActive) ?? [];
  const [technicianId, setTechnicianId] = useState("");

  function closeDialog() {
    setTechnicianId("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!technicianId) {
              return;
            }
            assign.mutate(technicianId, {
              onSuccess: () => {
                toast.success("Technician assigned");
                closeDialog();
              },
              onError: (error) => toastError(error, "Could not assign the technician"),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Assign technician</DialogTitle>
            <DialogDescription>Choose an active technician for this job.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="assign-technician">Technician</FieldLabel>
              <select
                id="assign-technician"
                className={selectClassName}
                value={technicianId}
                required
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Choose a technician</option>
                {active.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.user.name}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={assign.isPending || !technicianId}>
              {assign.isPending ? "Saving..." : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  workOrderId,
  open,
  onOpenChange,
}: {
  workOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const schedule = useScheduleWorkOrder(workOrderId);
  const [scheduledStart, setScheduledStart] = useState("");

  function closeDialog() {
    setScheduledStart("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = new Date(scheduledStart);
            if (Number.isNaN(parsed.getTime())) {
              return;
            }
            schedule.mutate(parsed.toISOString(), {
              onSuccess: () => {
                toast.success("Visit scheduled");
                closeDialog();
              },
              onError: (error) => toastError(error, "Could not schedule the visit"),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Schedule visit</DialogTitle>
            <DialogDescription>Set the date and time for this job.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="scheduled-start">Date and time</FieldLabel>
              <Input
                id="scheduled-start"
                type="datetime-local"
                value={scheduledStart}
                required
                onChange={(event) => setScheduledStart(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={schedule.isPending || !scheduledStart}>
              {schedule.isPending ? "Saving..." : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({
  workOrderId,
  open,
  onOpenChange,
}: {
  workOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const decline = useDeclineWorkOrder(workOrderId);
  const navigate = useNavigate();
  const [reason, setReason] = useState("");

  function closeDialog() {
    setReason("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = reason.trim();
            if (!trimmed) {
              return;
            }
            decline.mutate(trimmed, {
              onSuccess: () => {
                toast.success("Job declined");
                closeDialog();
                navigate("/work-orders");
              },
              onError: (error) => toastError(error, "Could not decline the job"),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Decline job</DialogTitle>
            <DialogDescription>The job returns to the unassigned queue.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="decline-reason">Reason</FieldLabel>
              <Input id="decline-reason" value={reason} required onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={decline.isPending || !reason.trim()}>
              {decline.isPending ? "Saving..." : "Decline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
