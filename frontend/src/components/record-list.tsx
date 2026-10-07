import type { ReactNode } from "react";

export function RecordList({ cards, table }: { cards: ReactNode; table: ReactNode }) {
  return (
    <>
      <div className="md:hidden">{cards}</div>
      <div className="hidden md:block">{table}</div>
    </>
  );
}

export function RecordCard({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>
      {children ? <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
