import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { AppShell } from "./AppShell";
import { NotFoundPage } from "./NotFoundPage";

export function UnknownRoute() {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Checking your session...</p>;
  }

  if (!currentUser.data) {
    return <NotFoundPage standalone />;
  }

  return (
    <AppShell>
      <NotFoundPage />
    </AppShell>
  );
}
