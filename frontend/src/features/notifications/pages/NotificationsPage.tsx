import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { audienceLabels, channelLabels, type Channel, type DeliveryStatus } from "../api/notifications.api";
import { useDeliveries, useRetryDelivery, useRules, useSweep, useUpdateRule } from "../hooks/useNotifications";

const channels: Channel[] = ["IN_APP", "EMAIL", "SMS"];

function Rules() {
  const rules = useRules(true);
  const update = useUpdateRule();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>Which events notify whom, and on which channels.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rules.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {rules.data ? (
          <Table aria-label="Notification rules">
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Audience</TableHead>
                {channels.map((channel) => (
                  <TableHead key={channel}>{channelLabels[channel]}</TableHead>
                ))}
                <TableHead>On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="font-medium">{rule.subject}</div>
                    <div className="text-xs text-muted-foreground">{rule.event}</div>
                  </TableCell>
                  <TableCell>{audienceLabels[rule.audience]}</TableCell>
                  {channels.map((channel) => {
                    const on = rule.channels.includes(channel);
                    return (
                      <TableCell key={channel}>
                        <input
                          type="checkbox"
                          aria-label={`${rule.event} ${channelLabels[channel]}`}
                          checked={on}
                          disabled={update.isPending || (on && rule.channels.length === 1)}
                          onChange={() =>
                            update.mutate({
                              id: rule.id,
                              channels: on ? rule.channels.filter((value) => value !== channel) : [...rule.channels, channel],
                            })
                          }
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`${rule.event} enabled`}
                      checked={rule.isEnabled}
                      disabled={update.isPending}
                      onChange={() => update.mutate({ id: rule.id, isEnabled: !rule.isEnabled })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NotificationsPage() {
  const currentUser = useCurrentUser();
  const [status, setStatus] = useState<DeliveryStatus | undefined>();
  const deliveries = useDeliveries(status);
  const retry = useRetryDelivery();
  const sweep = useSweep();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>Every notification sent, with its channel, attempts and any error.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {([undefined, "PENDING", "SENT", "FAILED"] as const).map((value) => (
              <Button key={value ?? "all"} size="sm" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>
                {value ? value[0] + value.slice(1).toLowerCase() : "All"}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="ml-auto" disabled={sweep.isPending} onClick={() => sweep.mutate()}>
              Check delays and expiring contracts
            </Button>
          </div>
          {sweep.data ? <p className="text-sm text-muted-foreground">{sweep.data.data.notified} new notifications.</p> : null}
          {deliveries.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {deliveries.data?.length === 0 ? <p className="text-sm text-muted-foreground">No deliveries.</p> : null}
          {deliveries.data && deliveries.data.length > 0 ? (
            <div className="overflow-x-auto">
              <Table aria-label="Deliveries">
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.subject}</div>
                        <div className="text-xs text-muted-foreground">{row.body}</div>
                      </TableCell>
                      <TableCell>{row.recipient.name}</TableCell>
                      <TableCell>{channelLabels[row.channel]}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "FAILED" ? "destructive" : row.status === "SENT" ? "default" : "secondary"}>
                          {row.status === "SENT" ? "Sent" : row.status === "FAILED" ? "Failed" : "Pending"}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
                          {row.lastError ? ` · ${row.lastError}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.status === "FAILED" ? (
                          <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                            Retry
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {currentUser.data?.role === "ADMIN" ? <Rules /> : null}
    </div>
  );
}
