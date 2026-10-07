import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCustomers } from "@/features/customers/hooks/useCustomers";

function dateLabel(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function statusLabel(status: string) {
  if (status === "ACTIVE") {
    return "Active";
  }
  if (status === "OUT_OF_SERVICE") {
    return "Out of service";
  }
  return "Decommissioned";
}

export function EquipmentPage() {
  const customers = useCustomers();
  const customer = customers.data?.[0];

  if (customers.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (customers.isError) {
    return <p className="text-sm text-destructive">Could not load your equipment.</p>;
  }
  if (!customer) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No account linked</EmptyTitle>
          <EmptyDescription>No customer record is linked to this login.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>{customer.name}</CardDescription>
        </CardHeader>
        <CardContent>
          {customer.addresses.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No addresses yet</EmptyTitle>
                <EmptyDescription>Service addresses will show here when they are added.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.addresses.map((address) => (
                  <TableRow key={address.id}>
                    <TableCell>{address.label}</TableCell>
                    <TableCell>
                      {address.line1}, {address.city}, {address.state} {address.postalCode}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
          <CardDescription>Equipment recorded for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          {customer.assets.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No equipment yet</EmptyTitle>
                <EmptyDescription>Equipment will show here when it is added.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>{asset.equipmentType}</TableCell>
                    <TableCell>{asset.model}</TableCell>
                    <TableCell>{asset.serialNumber}</TableCell>
                    <TableCell>{dateLabel(asset.warrantyExpiresAt)}</TableCell>
                    <TableCell>
                      <Badge variant={asset.status === "ACTIVE" ? "secondary" : "outline"}>
                        {statusLabel(asset.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
