import * as React from "react"
import { cn } from "cn"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

// The header is a wrapping row: the heading (title, description and anything else) takes the
// free space and never shrinks below basis-64 while actions sit beside it; when they do not fit,
// the actions drop onto their own line, aligned to the end, and wrap between buttons.
function CardHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const items = React.Children.toArray(children)
  const actions = items.filter(isCardAction)
  const heading = items.filter((item) => !isCardAction(item))
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header flex flex-wrap items-start gap-x-4 gap-y-3 rounded-t-xl px-(--card-spacing) has-[+[data-slot=card-content]]:border-b has-[+[data-slot=card-content]]:pb-(--card-spacing) has-[+[data-slot=card-footer]]:border-b has-[+[data-slot=card-footer]]:pb-(--card-spacing) [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    >
      <div data-slot="card-heading" className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5 [overflow-wrap:anywhere]">
        {heading}
      </div>
      {actions}
    </div>
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-lg leading-tight font-semibold tracking-tight group-data-[size=sm]/card:text-base",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2 self-start",
        className
      )}
      {...props}
    />
  )
}

function isCardAction(node: React.ReactNode) {
  return React.isValidElement(node) && node.type === CardAction
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
