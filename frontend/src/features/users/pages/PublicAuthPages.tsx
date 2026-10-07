import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/apiClient";
import { useAcceptInvitation, useConfirmPasswordReset, useRequestPasswordReset } from "../hooks/useUsers";
import {
  forgotPasswordSchema,
  setPasswordSchema,
  type ForgotPasswordInput,
  type SetPasswordInput,
} from "../schemas/user.schema";

function Shell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Field<span className="text-primary">Ops</span>
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children}
      </Card>
    </main>
  );
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : error ? "Something went wrong" : null;
}

function PasswordForm({
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (password: string) => void;
}) {
  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const message = errorText(error);
  return (
    <form className="contents" noValidate onSubmit={form.handleSubmit((values) => onSubmit(values.password))}>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={form.formState.errors.password ? true : undefined}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input id="new-password" type="password" autoComplete="new-password" {...form.register("password")} />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>
          <Field data-invalid={form.formState.errors.confirm ? true : undefined}>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...form.register("confirm")} />
            <FieldError errors={[form.formState.errors.confirm]} />
          </Field>
        </FieldGroup>
        {message ? <p className="mt-4 text-sm text-destructive">{message}</p> : null}
      </CardContent>
      <CardFooter>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </CardFooter>
    </form>
  );
}

export function ForgotPasswordPage() {
  const reset = useRequestPasswordReset();
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  if (reset.isSuccess) {
    return (
      <Shell title="Check your email" description="If the account exists, a reset link is on its way.">
        <CardFooter>
          <Link className="text-sm text-primary underline-offset-4 hover:underline" to="/login">
            Back to sign in
          </Link>
        </CardFooter>
      </Shell>
    );
  }
  return (
    <Shell title="Reset password" description="We will email you a link to choose a new password.">
      <form className="contents" noValidate onSubmit={form.handleSubmit((values) => reset.mutate(values.email))}>
        <CardContent>
          <Field data-invalid={form.formState.errors.email ? true : undefined}>
            <FieldLabel htmlFor="reset-email">Email</FieldLabel>
            <Input id="reset-email" type="email" autoComplete="email" {...form.register("email")} />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>
          {errorText(reset.error) ? <p className="mt-4 text-sm text-destructive">{errorText(reset.error)}</p> : null}
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button className="w-full" type="submit" disabled={reset.isPending}>
            {reset.isPending ? "Sending..." : "Send reset link"}
          </Button>
          <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" to="/login">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const confirm = useConfirmPasswordReset();
  const token = params.get("token") ?? "";
  if (confirm.isSuccess) {
    return (
      <Shell title="Password changed" description="Sign in with your new password.">
        <CardFooter>
          <Button className="w-full" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
        </CardFooter>
      </Shell>
    );
  }
  return (
    <Shell title="Choose a new password" description="Other signed-in sessions will be signed out.">
      <PasswordForm
        submitLabel="Change password"
        pending={confirm.isPending}
        error={confirm.error}
        onSubmit={(password) => confirm.mutate({ token, password })}
      />
    </Shell>
  );
}

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const accept = useAcceptInvitation();
  const token = params.get("token") ?? "";
  return (
    <Shell title="Join FieldOps" description="Choose a password to finish setting up your account.">
      <PasswordForm
        submitLabel="Create account"
        pending={accept.isPending}
        error={accept.error}
        onSubmit={(password) => accept.mutate({ token, password })}
      />
    </Shell>
  );
}
