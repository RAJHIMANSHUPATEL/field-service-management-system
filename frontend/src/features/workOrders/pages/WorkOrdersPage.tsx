import { Link } from "react-router-dom";
import { priorityLabel, recordLinkClassName } from "@/components/content";
import { RecordCard, RecordList } from "@/components/record-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import type { WorkOrderStatus } from "../api/workOrders.api";
import { useWorkOrders } from "../hooks/useWorkOrders";

function statusLabel(status: WorkOrderStatus) {
  if (status === "ASSIGNED") {
    return "Assigned";
  }
  if (status === "ACCEPTED") {
    return "Accepted";
  }
  return "Open";
}

export function WorkOrdersPage() {
  const currentUser = useCurrentUser();
  const workOrders = useWorkOrders();
  const isTechnician = currentUser.data?.role === "TECHNICIAN";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isTechnician ? "Jobs" : "Work orders"}</CardTitle>
        <CardDescription>
          {isTechnician ? "Jobs assigned to you." : "Accepted requests waiting for a technician."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {workOrders.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {workOrders.isError ? <p className="text-sm text-destructive">Could not load work orders.</p> : null}
        {workOrders.data?.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{isTechnician ? "No jobs yet" : "No work orders yet"}</EmptyTitle>
              <EmptyDescription>
                {isTechnician
                  ? "Jobs show here after they are assigned to you."
                  : "Accept a request, then assign a technician."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {workOrders.data && workOrders.data.length > 0 ? (
          <RecordList
            cards={workOrders.data.map((workOrder) => (
              <RecordCard
                key={workOrder.id}
                title={
                  <Link className={recordLinkClassName} to={`/work-orders/${workOrder.id}`}>
                    {workOrder.customer.name}
                  </Link>
                }
                meta={<Badge variant={workOrder.status === "ACCEPTED" ? "default" : "secondary"}>{statusLabel(workOrder.status)}</Badge>}
              >
                <span>
                  {workOrder.asset.equipmentType} · {workOrder.asset.serialNumber}
                </span>
                <span>
                  {workOrder.serviceType.name} · {priorityLabel(workOrder.priority)}
                </span>
              </RecordCard>
            ))}
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.data.map((workOrder) => (
                    <TableRow key={workOrder.id}>
                      <TableCell>
                        <Link className={recordLinkClassName} to={`/work-orders/${workOrder.id}`}>
                          {workOrder.customer.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {workOrder.asset.equipmentType} · {workOrder.asset.serialNumber}
                      </TableCell>
                      <TableCell>{workOrder.serviceType.name}</TableCell>
                      <TableCell>{priorityLabel(workOrder.priority)}</TableCell>
                      <TableCell>
                        <Badge variant={workOrder.status === "ACCEPTED" ? "default" : "secondary"}>{statusLabel(workOrder.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
