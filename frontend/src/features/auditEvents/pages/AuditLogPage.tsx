import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuditEvents } from "../hooks/useAuditEvents";

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const events = useAuditEvents(page);
  const pageCount = events.data?.meta.pageCount ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Every change, who made it, and when.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {events.isError ? <p className="text-sm text-destructive">Could not load the audit log.</p> : null}
        {events.data ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{event.actor?.name ?? "System"}</TableCell>
                  <TableCell className="font-mono text-xs">{event.action}</TableCell>
                  <TableCell className="font-mono text-xs">{event.entityId ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between">
        <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {Math.max(pageCount, 1)}
        </span>
        <Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </CardFooter>
    </Card>
  );
}
