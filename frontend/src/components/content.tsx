import type { ReactNode } from "react";

export const recordLinkClassName =
  "font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary";

export const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function priorityLabel(priority: string) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

export function FactList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{item.label}</dt>
          <dd className="text-sm leading-relaxed text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NoteThread({
  notes,
}: {
  notes: { id: string; author: string; body: string; createdAt: string }[];
}) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note.id} className="rounded-lg border bg-muted/50 px-3 py-2.5">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{note.author}</span>
            <time className="text-xs text-muted-foreground" dateTime={note.createdAt}>
              {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{note.body}</p>
        </li>
      ))}
    </ul>
  );
}
