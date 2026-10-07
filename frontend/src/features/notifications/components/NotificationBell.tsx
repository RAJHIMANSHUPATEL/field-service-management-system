import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInbox, useMarkRead } from "../hooks/useNotifications";

export function NotificationBell() {
  const inbox = useInbox();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const unread = inbox.data?.meta.unread ?? 0;
  const rows = inbox.data?.data.slice(0, 12) ?? [];

  return (
    // Opening the bell always fetches the latest, so it never shows a stale list.
    <DropdownMenu onOpenChange={(open) => open && void inbox.refetch()}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative ml-auto" aria-label={`Notifications, ${unread} unread`} />}
      >
        <Bell />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {rows.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">Nothing new.</p> : null}
          {rows.map((row) => (
            <DropdownMenuItem
              key={row.id}
              className="flex flex-col items-start gap-0.5"
              onClick={() => {
                if (!row.readAt) {
                  markRead.mutate(row.id);
                }
                if (row.link) {
                  void navigate(row.link);
                }
              }}
            >
              <span className={row.readAt ? "text-sm" : "text-sm font-semibold"}>{row.subject}</span>
              <span className="text-xs text-muted-foreground">{row.body}</span>
              <span className="text-[11px] text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
