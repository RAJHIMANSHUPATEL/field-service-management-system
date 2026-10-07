import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { VisitProgress } from "@/features/workOrders/components/VisitExecution";
import { visitStatusLabel, workOrderStatusLabel } from "@/lib/status";
import { toastError } from "@/lib/toastError";
import { useServiceTypes } from "@/features/serviceTypes/hooks/useServiceTypes";
import { attachmentTypes, attachmentUrl, type RequestAttachment } from "../api/serviceRequests.api";
import type { RequestPriority, RequestStatus } from "../api/serviceRequests.api";
import {
  useAcceptServiceRequest,
  useRejectServiceRequest,
  useReplyToServiceRequest,
  useRequestServiceInfo,
  useServiceRequest,
  useUploadAttachments,
} from "../hooks/useServiceRequests";
import { messageSchema, type MessageInput } from "../schemas/serviceRequest.schema";
import { statusLabel } from "./RequestsPage";

function dateLabel(value: string) {
  return value.slice(0, 10);
}

function statusVariant(status: RequestStatus) {
  if (status === "REJECTED") {
    return "destructive" as const;
  }
  if (status === "ACCEPTED") {
    return "default" as const;
  }
  if (status === "NEEDS_INFO") {
    return "outline" as const;
  }
  return "secondary" as const;
}

export function RequestDetailPage() {
  const { requestId = "" } = useParams();
  const currentUser = useCurrentUser();
  const request = useServiceRequest(requestId);
  const canTriage = currentUser.data?.role === "ADMIN" || currentUser.data?.role === "OPS";
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  if (request.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (request.isError || !request.data) {
    return <p className="text-sm text-destructive">Could not load this request.</p>;
  }

  const record = request.data;
  const openForTriage = record.status === "SUBMITTED" || record.status === "NEEDS_INFO";
  const showActions = Boolean(record.workOrder && canTriage) || (canTriage && openForTriage) || record.status === "NEEDS_INFO";

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
                value: `${dateLabel(record.preferredStart)} – ${dateLabel(record.preferredEnd)}`,
              },
              {
                label: "Address",
                value: `${record.address.label}, ${record.address.line1}, ${record.address.city}, ${record.address.state} ${record.address.postalCode}`,
              },
              ...(record.workOrder && !canTriage
                ? [
                    { label: "Job status", value: workOrderStatusLabel(record.workOrder.status) },
                    ...record.workOrder.visits
                      .filter((visit) => visit.status !== "CANCELLED")
                      .map((visit, index, all) => ({
                        label: all.length > 1 ? `Visit ${index + 1}` : "Visit",
                        value: `${new Date(visit.scheduledStart).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })} · ${visitStatusLabel(visit.status)}`,
                      })),
                  ]
                : []),
            ]}
          />
          {record.workOrder && !canTriage
            ? record.workOrder.visits
                .filter((visit) => visit.status !== "CANCELLED" && visit.enRouteAt)
                .map((visit) => (
                  <section key={visit.id} className="rounded-lg border px-3 py-2" aria-label="Job progress">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Job progress</p>
                    <VisitProgress visit={visit} />
                  </section>
                ))
            : null}
          <Attachments requestId={record.id} attachments={record.attachments} canAdd={record.status !== "REJECTED"} />
        </CardContent>
        {showActions ? (
          <CardFooter className="flex-wrap gap-2">
            {record.workOrder && canTriage ? (
              <Button nativeButton={false} render={<Link to={`/work-orders/${record.workOrder.id}`} />}>
                View work order
              </Button>
            ) : null}
            {canTriage && openForTriage ? (
              <>
                <Button type="button" onClick={() => setAcceptOpen(true)}>
                  Accept
                </Button>
                <Button type="button" variant="outline" onClick={() => setInfoOpen(true)}>
                  Request info
                </Button>
                <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              </>
            ) : null}
            {record.status === "NEEDS_INFO" ? (
              <Button type="button" variant="outline" onClick={() => setReplyOpen(true)}>
                Reply
              </Button>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thread</CardTitle>
          <CardDescription>Questions, replies, and the triage decision.</CardDescription>
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

      <AcceptDialog
        requestId={record.id}
        open={acceptOpen}
        priority={record.priority}
        serviceTypeId={record.serviceType.id}
        onOpenChange={setAcceptOpen}
      />
      <ReasonDialog
        title="Reject request"
        description="The customer will see this reason."
        submitLabel="Reject request"
        requestId={record.id}
        kind="reject"
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
      <ReasonDialog
        title="Request information"
        description="Ask the customer for what is missing."
        submitLabel="Send question"
        requestId={record.id}
        kind="info"
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />
      <ReasonDialog
        title="Reply"
        description="Send the missing information and return this request to the queue."
        submitLabel="Send reply"
        requestId={record.id}
        kind="reply"
        open={replyOpen}
        onOpenChange={setReplyOpen}
      />
    </div>
  );
}

function AcceptDialog({
  requestId,
  open,
  priority,
  serviceTypeId,
  onOpenChange,
}: {
  serviceTypeId: string;
  requestId: string;
  open: boolean;
  priority: RequestPriority;
  onOpenChange: (open: boolean) => void;
}) {
  const accept = useAcceptServiceRequest(requestId);
  const [nextPriority, setNextPriority] = useState<RequestPriority>(priority);
  const serviceTypes = useServiceTypes();
  const [nextServiceType, setNextServiceType] = useState(serviceTypeId);
  const [note, setNote] = useState("");

  function closeDialog() {
    setNextPriority(priority);
    setNote("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            accept.mutate(
              { priority: nextPriority, serviceTypeId: nextServiceType, note: note.trim() || undefined },
              {
                onSuccess: () => {
                  toast.success("Request accepted");
                  closeDialog();
                },
                onError: (error) => toastError(error, "Could not accept the request"),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Accept request</DialogTitle>
            <DialogDescription>This creates an unassigned work order.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="accept-priority">Priority</FieldLabel>
              <select
                id="accept-priority"
                className={selectClassName}
                value={nextPriority}
                onChange={(event) => setNextPriority(event.target.value as RequestPriority)}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="accept-service-type">Service type</FieldLabel>
              <select
                id="accept-service-type"
                className={selectClassName}
                value={nextServiceType}
                onChange={(event) => setNextServiceType(event.target.value)}
              >
                {(serviceTypes.data ?? [])
                  .filter((serviceType) => serviceType.isActive || serviceType.id === serviceTypeId)
                  .map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="accept-note">Note</FieldLabel>
              <Input id="accept-note" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending ? "Saving..." : "Accept"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  title,
  description,
  submitLabel,
  requestId,
  kind,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  submitLabel: string;
  requestId: string;
  kind: "reject" | "info" | "reply";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reject = useRejectServiceRequest(requestId);
  const requestInfo = useRequestServiceInfo(requestId);
  const reply = useReplyToServiceRequest(requestId);
  const pending = reject.isPending || requestInfo.isPending || reply.isPending;
  const form = useForm<MessageInput>({
    resolver: zodResolver(messageSchema),
    defaultValues: { message: "" },
  });

  function closeDialog() {
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            const onSuccess = () => {
              toast.success(kind === "reject" ? "Request rejected" : kind === "info" ? "Question sent" : "Reply sent");
              closeDialog();
            };
            const onError = (error: unknown) => toastError(error, "Could not update the request");
            if (kind === "reject") {
              reject.mutate(values.message, { onSuccess, onError });
              return;
            }
            if (kind === "info") {
              requestInfo.mutate(values.message, { onSuccess, onError });
              return;
            }
            reply.mutate(values.message, { onSuccess, onError });
          })}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.message ? true : undefined}>
              <FieldLabel htmlFor={`${kind}-message`}>Message</FieldLabel>
              <Input id={`${kind}-message`} aria-invalid={Boolean(form.formState.errors.message)} {...form.register("message")} />
              <FieldError errors={[form.formState.errors.message]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Attachments({
  requestId,
  attachments,
  canAdd,
}: {
  requestId: string;
  attachments: RequestAttachment[];
  canAdd: boolean;
}) {
  const upload = useUploadAttachments(requestId);
  if (attachments.length === 0 && !canAdd) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attachments</p>
      {attachments.length === 0 ? <p className="text-sm text-muted-foreground">No photos or files yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <button
              type="button"
              className="truncate text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={() =>
                void attachmentUrl(requestId, attachment.id)
                  .then((url) => window.open(url, "_blank", "noopener"))
                  .catch((error: unknown) => toastError(error, "Could not open the file"))
              }
            >
              {attachment.fileName}
            </button>
            <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(attachment.size)}</span>
          </li>
        ))}
      </ul>
      {canAdd ? (
        <label className="text-sm">
          <span className="sr-only">Add photos or files</span>
          <Input
            type="file"
            aria-label="Add photos or files"
            multiple
            accept={attachmentTypes.join(",")}
            disabled={upload.isPending}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) {
                upload.mutate(files, {
                  onSuccess: () => toast.success(files.length === 1 ? "File added" : "Files added"),
                  onError: (error) => toastError(error, "Could not upload the file"),
                });
              }
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
