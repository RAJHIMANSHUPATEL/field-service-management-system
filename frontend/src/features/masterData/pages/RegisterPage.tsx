import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/apiClient";
import { useRegisterOrganization } from "../hooks/useMasterData";
import { registerSchema, type RegisterInput } from "../schemas/masterData.schema";

const fields = [
  { name: "organizationName", label: "Company name", type: "text" },
  { name: "name", label: "Your name", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "password", label: "Password", type: "password" },
] as const;

export function RegisterPage() {
  const register = useRegisterOrganization();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { organizationName: "", name: "", email: "", password: "" },
  });
  const error = register.error instanceof ApiError ? register.error.message : null;

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Field<span className="text-primary">Ops</span>
          </p>
          <CardTitle className="text-2xl">Set up your company</CardTitle>
          <CardDescription>You become the first admin.</CardDescription>
        </CardHeader>
        <form className="contents" noValidate onSubmit={form.handleSubmit((values) => register.mutate(values))}>
          <CardContent>
            <FieldGroup>
              {fields.map((field) => (
                <Field key={field.name} data-invalid={form.formState.errors[field.name] ? true : undefined}>
                  <FieldLabel htmlFor={`register-${field.name}`}>{field.label}</FieldLabel>
                  <Input id={`register-${field.name}`} type={field.type} {...form.register(field.name)} />
                  <FieldError errors={[form.formState.errors[field.name]]} />
                </Field>
              ))}
            </FieldGroup>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button className="w-full" type="submit" disabled={register.isPending}>
              {register.isPending ? "Creating..." : "Create company"}
            </Button>
            <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" to="/login">
              Already have an account? Sign in
            </Link>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
