import { Link } from "react-router-dom";
import { recordLinkClassName } from "@/components/content";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stars } from "../components/FeedbackForm";
import { useFeedback } from "../hooks/useNotifications";

export function FeedbackPage() {
  const feedback = useFeedback();
  const meta = feedback.data?.meta;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer feedback</CardTitle>
        <CardDescription>
          {meta && meta.count > 0
            ? `Average ${meta.averageRating} / 5 from ${meta.count} rating${meta.count === 1 ? "" : "s"} · ${meta.satisfiedPercent}% satisfied`
            : "Ratings customers leave after completed jobs."}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {feedback.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {feedback.data?.data.length === 0 ? <p className="text-sm text-muted-foreground">No feedback yet.</p> : null}
        {feedback.data && feedback.data.data.length > 0 ? (
          <Table aria-label="Feedback">
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedback.data.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link className={recordLinkClassName} to={`/work-orders/${row.workOrder.id}`}>
                      {row.workOrder.customer.name} · {row.workOrder.asset.equipmentType}
                    </Link>
                  </TableCell>
                  <TableCell>{row.workOrder.technician?.user.name ?? "—"}</TableCell>
                  <TableCell>
                    <Stars rating={row.rating} />
                    <div className="text-xs text-muted-foreground">{row.satisfied ? "Satisfied" : "Not satisfied"}</div>
                  </TableCell>
                  <TableCell className="max-w-80 whitespace-normal">{row.comment ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
