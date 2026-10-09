import * as React from "react"
import { cn } from "cn"

// The container is the one horizontal scroller: it only scrolls when the table is still wider than
// its card after descriptive cells wrap. Pages must not add another overflow-x-auto around it.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full max-w-full min-w-0 overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

// Cells wrap by default (names, equipment, addresses, notes). `nowrap` keeps short values intact on
// one line: money, quantities, dates, status badges and row actions (and their column headers).
type NoWrap = { nowrap?: boolean }
const nowrapClass = "whitespace-nowrap tabular-nums"

function TableHead({ className, nowrap, ...props }: React.ComponentProps<"th"> & NoWrap) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-2 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase [&:has([role=checkbox])]:pr-0",
        nowrap && nowrapClass,
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, nowrap, ...props }: React.ComponentProps<"td"> & NoWrap) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2 py-3 align-middle break-words text-foreground [&:has([role=checkbox])]:pr-0",
        nowrap && nowrapClass,
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
