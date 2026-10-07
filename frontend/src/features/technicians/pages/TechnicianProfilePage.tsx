import { FactList } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useTechnicians } from "../hooks/useTechnicians";

export function TechnicianProfilePage() {
  const technicians = useTechnicians();
  const technician = technicians.data?.[0];

  if (technicians.isPending) {
    return <Skeleton className="h-40 w-full max-w-lg" />;
  }
  if (technicians.isError) {
    return <p className="text-sm text-destructive">Could not load your profile.</p>;
  }
  if (!technician) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No profile linked</EmptyTitle>
          <EmptyDescription>No technician profile is linked to this login.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <Badge variant={technician.isActive ? "default" : "outline"}>{technician.isActive ? "Active" : "Inactive"}</Badge>
        <CardTitle>{technician.user.name}</CardTitle>
        <CardDescription>Technician profile</CardDescription>
      </CardHeader>
      <CardContent>
        <FactList
          items={[
            { label: "Email", value: technician.user.email },
            { label: "Phone", value: technician.phone ?? "No phone on file" },
          ]}
        />
      </CardContent>
    </Card>
  );
}
