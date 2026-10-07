import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const card = (
    <Card>
      <CardHeader>
        <CardTitle>Page not found</CardTitle>
        <CardDescription>This address is not part of FieldOps.</CardDescription>
      </CardHeader>
    </Card>
  );

  if (standalone) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6">
        <div className="w-full max-w-md">{card}</div>
      </main>
    );
  }

  return card;
}
