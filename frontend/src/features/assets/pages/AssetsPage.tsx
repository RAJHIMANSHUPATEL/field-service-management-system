import { Link } from "react-router-dom";
import { recordLinkClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAllAssets } from "../hooks/useAssets";

function warranty(value: string | null) {
  if (!value) {
    return <span className="text-muted-foreground">None</span>;
  }
  const date = value.slice(0, 10);
  const active = new Date(value).getTime() >= Date.now();
  return <Badge variant={active ? "secondary" : "outline"}>{active ? `Until ${date}` : `Ended ${date}`}</Badge>;
}

export function AssetsPage() {
  const assets = useAllAssets();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assets</CardTitle>
        <CardDescription>All customer equipment. Add equipment from the customer page.</CardDescription>
      </CardHeader>
      <CardContent>
        {assets.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {assets.isError ? <p className="text-sm text-destructive">Could not load assets.</p> : null}
        {assets.data?.length === 0 ? <p className="text-sm text-muted-foreground">No assets yet.</p> : null}
        {assets.data && assets.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Warranty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.data.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    {asset.equipmentType} · {asset.model}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{asset.serialNumber}</TableCell>
                  <TableCell>
                    {asset.customer ? (
                      <Link className={recordLinkClassName} to={`/customers/${asset.customer.id}`}>
                        {asset.customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{warranty(asset.warrantyExpiresAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
