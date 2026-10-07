import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Metrics } from "../api/analytics.api";
import { usePerformance } from "../hooks/useAnalytics";

const dash = (value: number | null, suffix = "") => (value === null ? "—" : `${value}${suffix}`);

function Cells({ row }: { row: Metrics }) {
  return (
    <>
      <TableCell className="text-right">{row.jobsCompleted}</TableCell>
      <TableCell className="text-right">{row.jobsPending}</TableCell>
      <TableCell className="text-right">{dash(row.firstVisitResolutionPercent, "%")}</TableCell>
      <TableCell className="text-right">{row.repeatVisitJobs}</TableCell>
      <TableCell className="text-right">{dash(row.averageServiceMinutes, " min")}</TableCell>
      <TableCell className="text-right">{dash(row.averageCompletionHours, " h")}</TableCell>
      <TableCell className="text-right">{row.averageRating === null ? "—" : `${row.averageRating}/5 (${row.ratings})`}</TableCell>
      <TableCell className="text-right">{row.cancelledVisits}</TableCell>
      <TableCell className="text-right">{row.partsConsumed}</TableCell>
    </>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const performance = usePerformance(days);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technician performance</CardTitle>
        <CardDescription>
          Jobs count for the technician whose visit completed them, in the period. First-visit resolution is completed jobs with one
          on-site visit over completed jobs; service time is start to completion per visit; completion time is job created to job completed.
        </CardDescription>
        <CardAction className="flex gap-1">
          {[7, 30, 90].map((value) => (
            <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>
              {value} days
            </Button>
          ))}
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {performance.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {performance.data ? (
          <Table aria-label="Technician performance">
            <TableHeader>
              <TableRow>
                <TableHead>Technician</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">First visit</TableHead>
                <TableHead className="text-right">Repeat jobs</TableHead>
                <TableHead className="text-right">Service time</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Parts used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.data.data.map((row) => (
                <TableRow key={row.technician.id}>
                  <TableCell className="font-medium">{row.technician.name}</TableCell>
                  <Cells row={row} />
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Team</TableCell>
                <Cells row={performance.data.meta.team} />
              </TableRow>
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
