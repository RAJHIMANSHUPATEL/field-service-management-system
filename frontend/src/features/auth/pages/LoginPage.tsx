import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/apiClient";
import { useLogin } from "../hooks/useLogin";
import { loginSchema, type LoginInput } from "../schemas/login.schema";

export function LoginPage() {
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginError = login.error instanceof ApiError ? login.error.message : null;

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Field<span className="text-primary">Ops</span>
          </p>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Use the account your administrator created.</CardDescription>
        </CardHeader>
        <form className="contents" onSubmit={form.handleSubmit((values) => login.mutate(values))} noValidate>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={form.formState.errors.email ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>
              <Field data-invalid={form.formState.errors.password ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                <FieldError errors={[form.formState.errors.password]} />
              </Field>
            </FieldGroup>
            {loginError ? <p className="mt-4 text-sm text-destructive">{loginError}</p> : null}
          </CardContent>
          <CardFooter>
            <div className="flex w-full flex-col gap-3">
              <Button className="w-full" type="submit" disabled={login.isPending}>
                {login.isPending ? "Signing in..." : "Sign in"}
              </Button>
              <Link className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline" to="/forgot-password">
                Forgot password?
              </Link>
              <Link className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline" to="/register">
                New company? Set it up
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
