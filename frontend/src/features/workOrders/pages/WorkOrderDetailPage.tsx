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
import { visitStatusLabel, workOrderStatusLabel } from "@/lib/status";
import { toastError } from "@/lib/toastError";
import type { Visit, WorkOrderStatus } from "../api/workOrders.api";
import { openServiceReport } from "@/features/invoices/api/invoices.api";
import { PartRequests } from "../components/FollowUp";
import { AddNoteForm, ExecutionPanel, VisitProgress } from "../components/VisitExecution";
import { CandidateHint, ReassignDialog, ReplanDialog, VisitHistory } from "../components/VisitPlanning";
import { nextVisitStep, visitSteps } from "../schemas/workOrder.schema";
import {
  useAcceptWorkOrder,
  useAssignWorkOrder,
  useDeclineWorkOrder,
  useMoveVisit,
  useScheduleWorkOrder,
  useWorkOrder,
} from "../hooks/useWorkOrders";

function dateLabel(value: string) {
  return value.slice(0, 10);
}

function statusLabel(status: WorkOrderStatus) {
  return workOrderStatusLabel(status);
}

function statusVariant(status: WorkOrderStatus) {
  if (status === "ACCEPTED" || status === "IN_PROGRESS") {
    return "default" as const;
  }
  if (status === "ASSIGNED") {
    return "secondary" as const;
  }
  return "outline" as const;
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
  const moveVisit = useMoveVisit(workOrderId);
  const technicians = useTechnicians();
  const [replan, setReplan] = useState<{ visit: Visit; mode: "reschedule" | "cancel" } | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const technicianNames = Object.fromEntries((technicians.data ?? []).map((row) => [row.id, row.user.name]));

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
  const showAssign = canAssign && (record.status === "OPEN" || record.status === "ASSIGNED") && !hasScheduledVisit;
  const showSchedule =
    canAssign && (record.status === "ASSIGNED" || record.status === "FOLLOW_UP_REQUIRED") && !hasScheduledVisit;
  const showAccept = isAssignee && record.status === "ASSIGNED" && hasScheduledVisit;
  const showDecline = isAssignee && record.status === "ASSIGNED";
  const activeVisit = record.visits.find((visit) => nextVisitStep(visit.status) !== null);
  const visitStep =
    isAssignee && record.status === "ACCEPTED" && activeVisit ? nextVisitStep(activeVisit.status) : null;

  const showReassign =
    canAssign && Boolean(record.technician) && (record.status === "ACCEPTED" || (record.status === "ASSIGNED" && hasScheduledVisit));
  const showActions = record.status === "COMPLETED" || canAssign || showAssign || showSchedule || showAccept || showDecline || visitStep !== null;

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
            ...(record.maintenancePlan ? [{ label: "Maintenance plan", value: record.maintenancePlan.name }] : []),
            ...(record.feedback
              ? [
                  {
                    label: "Customer feedback",
                    value: `${record.feedback.rating}/5 · ${record.feedback.satisfied ? "Satisfied" : "Not satisfied"}${
                      record.feedback.comment ? ` · “${record.feedback.comment}”` : ""
                    }`,
                  },
                ]
              : []),
          ]}
        />
        {record.visits.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Visits</p>
            <ul className="flex flex-col gap-2">
              {record.visits.map((visit) => (
                <li key={visit.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{visitTime(visit.scheduledStart)}</span>
                    <Badge variant={visit.status === "CANCELLED" ? "outline" : "default"}>
                      {visitStatusLabel(visit.status)}
                    </Badge>
                  </div>
                  {canAssign && visit.status === "SCHEDULED" ? (
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setReplan({ visit, mode: "reschedule" })}>
                        Reschedule
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReplan({ visit, mode: "cancel" })}>
                        Cancel visit
                      </Button>
                    </div>
                  ) : null}
                  <VisitProgress visit={visit} />
                  {isAssignee && (visit.status === "ARRIVED" || visit.status === "IN_PROGRESS") ? (
                    <div className="mt-3">
                      <ExecutionPanel workOrderId={record.id} visit={visit} />
                    </div>
                  ) : null}
                  {canAssign ? <VisitHistory visit={visit} names={technicianNames} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <PartRequests workOrderId={record.id} requests={record.partRequests} canResolve={canAssign} />
      </CardContent>
      {showActions ? (
        <CardFooter className="flex-wrap gap-2">
          {canAssign ? (
            <Button variant="outline" nativeButton={false} render={<Link to={`/requests/${record.request.id}`} />}>
              View request
            </Button>
          ) : null}
          {record.status === "COMPLETED" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => openServiceReport(record.id).catch((error: unknown) => toastError(error, "Could not open the report"))}
            >
              Service report
            </Button>
          ) : null}
          {canAssign && record.invoice ? (
            <Button nativeButton={false} render={<Link to={`/invoices/${record.invoice.id}`} />}>
              Invoice
            </Button>
          ) : null}
          {visitStep && activeVisit ? (
            <Button
              type="button"
              size="lg"
              className="h-12 w-full sm:w-auto"
              disabled={moveVisit.isPending}
              onClick={() =>
                moveVisit.mutate(
                  { visitId: activeVisit.id, step: visitStep },
                  {
                    onSuccess: () => toast.success(visitSteps[visitStep].done),
                    onError: (error) => toastError(error, "Could not update the visit"),
                  },
                )
              }
            >
              {moveVisit.isPending ? "Saving..." : visitSteps[visitStep].label}
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
          {showReassign ? (
            <Button type="button" variant="outline" onClick={() => setReassignOpen(true)}>
              Reassign
            </Button>
          ) : null}
          {showAssign ? (
            <Button type="button" variant={showSchedule ? "outline" : "default"} onClick={() => setAssignOpen(true)}>
              Assign
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
      {replan ? (
        <ReplanDialog workOrderId={record.id} visit={replan.visit} mode={replan.mode} onClose={() => setReplan(null)} />
      ) : null}
      {reassignOpen && record.technician ? (
        <ReassignDialog
          workOrderId={record.id}
          currentTechnicianId={record.technician.id}
          onClose={() => setReassignOpen(false)}
        />
      ) : null}
      {showAssign ? <AssignDialog workOrderId={record.id} open={assignOpen} onOpenChange={setAssignOpen} /> : null}
      {showSchedule ? (
        <ScheduleDialog workOrderId={record.id} open={scheduleOpen} onOpenChange={setScheduleOpen} />
      ) : null}
      {showDecline ? <DeclineDialog workOrderId={record.id} open={declineOpen} onOpenChange={setDeclineOpen} /> : null}
    </Card>
    {record.notes.length > 0 || canAssign || isAssignee ? (
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Office and technician notes on this job, including decline reasons.</CardDescription>
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
          {canAssign || (isAssignee && record.status !== "COMPLETED") ? (
            <div className="mt-4">
              <AddNoteForm workOrderId={record.id} />
            </div>
          ) : null}
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
            <DialogDescription>Choose an active technician for this job. Suggestions are scored out of 100.</DialogDescription>
          </DialogHeader>
          <CandidateHint workOrderId={workOrderId} />
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
                navigate("/my-jobs");
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
