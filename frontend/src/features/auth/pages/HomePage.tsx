import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { useServiceRequests } from "@/features/serviceRequests/hooks/useServiceRequests";
import { useServiceTypes } from "@/features/serviceTypes/hooks/useServiceTypes";
import { useTechnicians } from "@/features/technicians/hooks/useTechnicians";
import { useCurrentUser } from "../hooks/useCurrentUser";

function CountCard({
  title,
  description,
  to,
  count,
  pending,
}: {
  title: string;
  description: string;
  to: string;
  count: number | undefined;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{pending ? <Skeleton className="h-8 w-16" /> : (count ?? "—")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
      <CardFooter>
        <Button nativeButton={false} render={<Link to={to} />}>
          Open
        </Button>
      </CardFooter>
    </Card>
  );
}

function AdminHome() {
  const customers = useCustomers();
  const serviceTypes = useServiceTypes();
  const technicians = useTechnicians();
  const openRequests = useServiceRequests({ open: true, limit: 1 });

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CountCard
        title="Open requests"
        description="Submitted or waiting on information."
        to="/requests"
        count={openRequests.data?.meta.total}
        pending={openRequests.isPending}
      />
      <CountCard
        title="Customers"
        description="Accounts this company services."
        to="/customers"
        count={customers.data?.length}
        pending={customers.isPending}
      />
      <CountCard
        title="Service types"
        description="Work this company offers."
        to="/service-types"
        count={serviceTypes.data?.length}
        pending={serviceTypes.isPending}
      />
      <CountCard
        title="Technicians"
        description="People who go on site."
        to="/technicians"
        count={technicians.data?.length}
        pending={technicians.isPending}
      />
    </div>
  );
}

export function HomePage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  if (user.role === "CUSTOMER") {
    return <Navigate to="/equipment" replace />;
  }

  if (user.role === "TECHNICIAN") {
    return <Navigate to="/work-orders" replace />;
  }

  return <AdminHome />;
}
