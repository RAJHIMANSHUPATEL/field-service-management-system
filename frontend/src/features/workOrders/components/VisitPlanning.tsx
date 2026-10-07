import { useState } from "react";
import { toast } from "sonner";
import { selectClassName } from "@/components/content";
import { Button } from "@/components/ui/button";
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
import { toastError } from "@/lib/toastError";
import type { Visit, VisitChange } from "../api/workOrders.api";
import { useCancelVisit, useCandidates, useReassignWorkOrder, useRescheduleVisit } from "../hooks/useWorkOrders";

function time(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function changeText(change: VisitChange, names: Record<string, string>) {
  const who = (id: string | null) => (id ? (names[id] ?? "another technician") : "nobody");
  if (change.kind === "SCHEDULED") {
    return `Scheduled for ${change.toStart ? time(change.toStart) : "—"}`;
  }
  if (change.kind === "RESCHEDULED") {
    return `Moved from ${change.fromStart ? time(change.fromStart) : "—"} to ${change.toStart ? time(change.toStart) : "—"}`;
  }
  if (change.kind === "REASSIGNED") {
    return `Moved from ${who(change.fromTechnicianId)} to ${who(change.toTechnicianId)}`;
  }
  return "Cancelled";
}

export function VisitHistory({ visit, names }: { visit: Visit; names: Record<string, string> }) {
  if (visit.changes.length === 0) {
    return null;
  }
  return (
    <ol className="mt-2 flex flex-col gap-1 border-l pl-3 text-xs text-muted-foreground" aria-label="Visit history">
      {visit.changes.map((change) => (
        <li key={change.id}>
          <span className="text-foreground">{changeText(change, names)}</span>
          {change.reason ? ` · ${change.reason}` : ""} · {change.actor.name}, {time(change.createdAt)}
        </li>
      ))}
    </ol>
  );
}

function localValue(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ReplanDialog({
  workOrderId,
  visit,
  mode,
  onClose,
}: {
  workOrderId: string;
  visit: Visit;
  mode: "reschedule" | "cancel";
  onClose: () => void;
}) {
  const reschedule = useRescheduleVisit(workOrderId);
  const cancel = useCancelVisit(workOrderId);
  const [start, setStart] = useState(localValue(visit.scheduledStart));
  const [reason, setReason] = useState("");
  const pending = reschedule.isPending || cancel.isPending;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) {
              return;
            }
            const options = {
              onSuccess: () => {
                toast.success(mode === "reschedule" ? "Visit rescheduled" : "Visit cancelled");
                onClose();
              },
              onError: (error: unknown) => toastError(error, "Could not update the visit"),
            };
            if (mode === "reschedule") {
              reschedule.mutate(
                { visitId: visit.id, scheduledStart: new Date(start).toISOString(), reason: reason.trim() },
                options,
              );
            } else {
              cancel.mutate({ visitId: visit.id, reason: reason.trim() }, options);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "reschedule" ? "Reschedule visit" : "Cancel visit"}</DialogTitle>
            <DialogDescription>
              {mode === "reschedule"
                ? "The change and its reason are kept in the visit history."
                : "The job goes back to assigned so a new time can be set."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {mode === "reschedule" ? (
              <Field>
                <FieldLabel htmlFor="replan-start">New date and time</FieldLabel>
                <Input
                  id="replan-start"
                  type="datetime-local"
                  value={start}
                  required
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="replan-reason">Reason</FieldLabel>
              <Input id="replan-reason" value={reason} required onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button
              type="submit"
              variant={mode === "cancel" ? "destructive" : "default"}
              disabled={pending || !reason.trim()}
            >
              {pending ? "Saving..." : mode === "reschedule" ? "Reschedule" : "Cancel visit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CandidateHint({ workOrderId }: { workOrderId: string }) {
  const candidates = useCandidates(workOrderId, true);
  if (!candidates.data || candidates.data.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-2 text-xs" aria-label="Suggested technicians">
      {candidates.data.map((row) => (
        <li key={row.technicianId} className="flex justify-between gap-2">
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="text-muted-foreground">
            {row.score} · skill {row.breakdown.skill} · area {row.breakdown.area} · {row.openJobs} open
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReassignDialog({
  workOrderId,
  currentTechnicianId,
  onClose,
}: {
  workOrderId: string;
  currentTechnicianId: string;
  onClose: () => void;
}) {
  const candidates = useCandidates(workOrderId, true);
  const reassign = useReassignWorkOrder(workOrderId);
  const [technicianId, setTechnicianId] = useState("");
  const [reason, setReason] = useState("");
  const options = (candidates.data ?? []).filter((row) => row.technicianId !== currentTechnicianId);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!technicianId || !reason.trim()) {
              return;
            }
            reassign.mutate(
              { technicianId, reason: reason.trim() },
              {
                onSuccess: () => {
                  toast.success("Job reassigned");
                  onClose();
                },
                onError: (error) => toastError(error, "Could not reassign the job"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Reassign job</DialogTitle>
            <DialogDescription>The new technician has to accept. A scheduled visit moves with the job.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reassign-technician">New technician</FieldLabel>
              <select
                id="reassign-technician"
                className={selectClassName}
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Choose a technician</option>
                {options.map((row) => (
                  <option key={row.technicianId} value={row.technicianId}>
                    {row.name} · score {row.score}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="reassign-reason">Reason</FieldLabel>
              <Input id="reassign-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={reassign.isPending || !technicianId || !reason.trim()}>
              {reassign.isPending ? "Saving..." : "Reassign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
