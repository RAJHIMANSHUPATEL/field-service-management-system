import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { textareaClassName } from "@/components/content";
import { toastError } from "@/lib/toastError";
import { UnsuccessfulDialog } from "./FollowUp";
import { VisitParts } from "./VisitParts";
import { photoTypes, visitPhotoUrl, type Visit } from "../api/workOrders.api";
import {
  useAddWorkOrderNote,
  useCompleteVisit,
  useSaveVisitReport,
  useSignVisit,
  useUploadVisitPhoto,
} from "../hooks/useWorkOrders";

function stamp(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

// The steps the customer and office see for one visit, in order.
export type VisitProgressData = Pick<
  Visit,
  | "id"
  | "enRouteAt"
  | "arrivedAt"
  | "startedAt"
  | "completedAt"
  | "endedAt"
  | "outcomeReason"
  | "signedAt"
  | "diagnosis"
  | "workPerformed"
  | "signerName"
> & { photos: { id: string; fileName: string; caption: string | null }[] };

export function VisitProgress({ visit }: { visit: VisitProgressData }) {
  const steps = [
    { label: "On the way", at: visit.enRouteAt },
    { label: "Arrived", at: visit.arrivedAt },
    { label: "Work started", at: visit.startedAt },
    { label: "Signed", at: visit.signedAt },
    { label: "Completed", at: visit.completedAt },
    { label: "Ended without finishing", at: visit.endedAt },
  ].filter((step) => step.at);
  return (
    <div className="mt-2 flex flex-col gap-2 text-sm">
      {steps.length > 0 ? (
        <ol className="flex flex-col gap-1" aria-label="Visit progress">
          {steps.map((step) => (
            <li key={step.label} className="flex justify-between gap-2 text-xs">
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">{stamp(step.at)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {visit.outcomeReason ? (
        <p>
          <span className="font-medium">Why it could not finish: </span>
          {visit.outcomeReason}
        </p>
      ) : null}
      {visit.diagnosis ? (
        <p>
          <span className="font-medium">Diagnosis: </span>
          {visit.diagnosis}
        </p>
      ) : null}
      {visit.workPerformed ? (
        <p>
          <span className="font-medium">Work performed: </span>
          {visit.workPerformed}
        </p>
      ) : null}
      {visit.photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Visit photos">
          {visit.photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className="text-xs font-semibold text-primary underline underline-offset-4"
                onClick={() =>
                  visitPhotoUrl(visit.id, photo.id).then(
                    (url) => window.open(url, "_blank", "noopener"),
                    (error: unknown) => toastError(error, "Could not open the photo"),
                  )
                }
              >
                {photo.caption ?? photo.fileName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {visit.signerName ? <p className="text-xs text-muted-foreground">Signed by {visit.signerName}</p> : null}
    </div>
  );
}

// On-site panel for the technician: findings, photos, signature, then completion.
export function ExecutionPanel({ workOrderId, visit }: { workOrderId: string; visit: Visit }) {
  const save = useSaveVisitReport(workOrderId);
  const upload = useUploadVisitPhoto(workOrderId);
  const complete = useCompleteVisit(workOrderId);
  const [diagnosis, setDiagnosis] = useState(visit.diagnosis ?? "");
  const [workPerformed, setWorkPerformed] = useState(visit.workPerformed ?? "");
  const [caption, setCaption] = useState("");
  const inProgress = visit.status === "IN_PROGRESS";
  const ready = Boolean(visit.workPerformed && visit.signerName);
  const [endOpen, setEndOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-3" aria-label="On-site work">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const input = {
            ...(diagnosis.trim() ? { diagnosis: diagnosis.trim() } : {}),
            ...(workPerformed.trim() ? { workPerformed: workPerformed.trim() } : {}),
          };
          if (Object.keys(input).length === 0) {
            return;
          }
          save.mutate(
            { visitId: visit.id, ...input },
            {
              onSuccess: () => toast.success("Report saved"),
              onError: (error) => toastError(error, "Could not save the report"),
            },
          );
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="visit-diagnosis">Diagnosis</FieldLabel>
            <textarea
              id="visit-diagnosis"
              className={textareaClassName}
              value={diagnosis}
              onChange={(event) => setDiagnosis(event.target.value)}
            />
          </Field>
          {inProgress ? (
            <Field>
              <FieldLabel htmlFor="visit-work">Work performed</FieldLabel>
              <textarea
                id="visit-work"
                className={textareaClassName}
                value={workPerformed}
                onChange={(event) => setWorkPerformed(event.target.value)}
              />
            </Field>
          ) : null}
        </FieldGroup>
        <Button type="submit" variant="outline" className="h-11" disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save report"}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="visit-photo-caption">Photo caption</FieldLabel>
        <Input id="visit-photo-caption" value={caption} onChange={(event) => setCaption(event.target.value)} />
        <FieldLabel htmlFor="visit-photo">Add photo</FieldLabel>
        <Input
          id="visit-photo"
          type="file"
          accept={photoTypes.join(",")}
          capture="environment"
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) {
              return;
            }
            upload.mutate(
              { visitId: visit.id, file, caption: caption.trim() || undefined },
              {
                onSuccess: () => {
                  setCaption("");
                  toast.success("Photo added");
                },
                onError: (error) => toastError(error, "Could not add the photo"),
              },
            );
          }}
        />
      </div>

      <VisitParts workOrderId={workOrderId} visit={visit} />

      {inProgress ? <SignaturePad workOrderId={workOrderId} visit={visit} /> : null}

      {inProgress ? (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full"
            disabled={!ready || complete.isPending}
            onClick={() =>
              complete.mutate(visit.id, {
                onSuccess: () => toast.success("Job completed"),
                onError: (error) => toastError(error, "Could not complete the job"),
              })
            }
          >
            {complete.isPending ? "Saving..." : "Complete job"}
          </Button>
          {!ready ? (
            <p className="text-xs text-muted-foreground">Save the work performed and get the customer signature first.</p>
          ) : null}
        </div>
      ) : null}
      <Button type="button" variant="ghost" className="h-11 text-destructive" onClick={() => setEndOpen(true)}>
        Can't finish today
      </Button>
      {endOpen ? <UnsuccessfulDialog workOrderId={workOrderId} visitId={visit.id} onClose={() => setEndOpen(false)} /> : null}
    </section>
  );
}

function SignaturePad({ workOrderId, visit }: { workOrderId: string; visit: Visit }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [signerName, setSignerName] = useState("");
  const sign = useSignVisit(workOrderId);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.lineWidth = 2;
      context.lineCap = "round";
      context.strokeStyle = "#111827";
    }
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    };
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
  }

  if (visit.signerName) {
    return <p className="text-sm">Signed by {visit.signerName}.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor="signer-name">Customer name</FieldLabel>
      <Input id="signer-name" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
      <p className="text-sm font-medium" id="signature-label">
        Customer signature
      </p>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        aria-labelledby="signature-label"
        className="h-32 w-full touch-none rounded-lg border bg-white"
        onPointerDown={(event) => {
          drawing.current = true;
          const context = event.currentTarget.getContext("2d");
          const { x, y } = point(event);
          context?.beginPath();
          context?.moveTo(x, y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) {
            return;
          }
          const context = event.currentTarget.getContext("2d");
          const { x, y } = point(event);
          context?.lineTo(x, y);
          context?.stroke();
          setHasInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
        }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={clear}>
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={!hasInk || !signerName.trim() || sign.isPending}
          onClick={() => {
            const image = canvasRef.current?.toDataURL("image/png");
            if (!image) {
              return;
            }
            sign.mutate(
              { visitId: visit.id, signerName: signerName.trim(), image },
              {
                onSuccess: () => toast.success("Signature saved"),
                onError: (error) => toastError(error, "Could not save the signature"),
              },
            );
          }}
        >
          {sign.isPending ? "Saving..." : "Save signature"}
        </Button>
      </div>
    </div>
  );
}

export function AddNoteForm({ workOrderId }: { workOrderId: string }) {
  const add = useAddWorkOrderNote(workOrderId);
  const [body, setBody] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) {
          return;
        }
        add.mutate(body.trim(), {
          onSuccess: () => {
            setBody("");
            toast.success("Note added");
          },
          onError: (error) => toastError(error, "Could not add the note"),
        });
      }}
    >
      <FieldLabel htmlFor="work-order-note">Add a note</FieldLabel>
      <textarea
        id="work-order-note"
        className={textareaClassName}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <Button type="submit" variant="outline" disabled={add.isPending || !body.trim()}>
        {add.isPending ? "Saving..." : "Add note"}
      </Button>
    </form>
  );
}
