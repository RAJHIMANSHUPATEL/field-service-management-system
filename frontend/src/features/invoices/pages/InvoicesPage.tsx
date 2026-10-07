import { Link } from "react-router-dom";
import { recordLinkClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { formatMoney, invoiceStatusLabels } from "../api/invoices.api";
import { useInvoices } from "../hooks/useInvoices";

export function InvoicesPage() {
  const currentUser = useCurrentUser();
  const invoices = useInvoices();
  const isCustomer = currentUser.data?.role === "CUSTOMER";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>{isCustomer ? "Invoices for your jobs." : "Drafts prepared at completion, then issued and paid."}</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {invoices.isError ? <p className="text-sm text-destructive">Could not load invoices.</p> : null}
        {invoices.data?.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : null}
        {invoices.data && invoices.data.length > 0 ? (
          <Table aria-label="Invoices">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                {isCustomer ? null : <TableHead>Customer</TableHead>}
                <TableHead>Equipment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link className={recordLinkClassName} to={`/invoices/${row.id}`}>
                      {row.number ?? "Draft"}
                    </Link>
                  </TableCell>
                  {isCustomer ? null : <TableCell>{row.customer.name}</TableCell>}
                  <TableCell>{row.workOrder.asset.equipmentType}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.total, row.currency)}</TableCell>
                  <TableCell>{row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "OVERDUE" ? "destructive" : row.status === "PAID" ? "default" : "secondary"}>
                      {invoiceStatusLabels[row.status]}
                    </Badge>
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
