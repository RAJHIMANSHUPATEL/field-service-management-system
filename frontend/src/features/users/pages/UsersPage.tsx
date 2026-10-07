import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { selectClassName } from "@/components/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastError } from "@/lib/toastError";
import type { InvitationStatus } from "../api/users.api";
import { useInvitations, useInviteUser, useRevokeInvitation, useUsers } from "../hooks/useUsers";
import { inviteSchema, type InviteInput } from "../schemas/user.schema";

const roleLabel = { ADMIN: "Admin", OPS: "Operations", TECHNICIAN: "Technician", CUSTOMER: "Customer" } as const;
const invitationLabel: Record<InvitationStatus, string> = { PENDING: "Pending", ACCEPTED: "Accepted", REVOKED: "Revoked" };

export function UsersPage() {
  const users = useUsers();
  const invitations = useInvitations();
  const revoke = useRevokeInvitation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Users and roles</CardTitle>
          <CardDescription>Everyone who can sign in to this company.</CardDescription>
          <CardAction>
            <Button type="button" onClick={() => setOpen(true)}>
              Invite user
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {users.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {users.isError ? <p className="text-sm text-destructive">Could not load users.</p> : null}
          {users.data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabel[user.role]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      {invitations.data && invitations.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
            <CardDescription>Invitees set their own password from the emailed link.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.data.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.name}</TableCell>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{roleLabel[invitation.role]}</TableCell>
                    <TableCell>
                      <Badge variant={invitation.status === "PENDING" ? "default" : "outline"}>
                        {invitationLabel[invitation.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {invitation.status === "PENDING" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate(invitation.id, {
                              onSuccess: () => toast.success("Invitation revoked"),
                              onError: (error) => toastError(error, "Could not revoke the invitation"),
                            })
                          }
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <InviteDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteUser();
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", role: "OPS" },
  });

  function closeDialog() {
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) =>
            invite.mutate(values, {
              onSuccess: () => {
                toast.success("Invitation sent");
                closeDialog();
              },
              onError: (error) => toastError(error, "Could not send the invitation"),
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>Add a staff member. Technicians are added on the Technicians page.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={form.formState.errors.name ? true : undefined}>
              <FieldLabel htmlFor="invite-name">Name</FieldLabel>
              <Input id="invite-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field data-invalid={form.formState.errors.email ? true : undefined}>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input id="invite-email" type="email" {...form.register("email")} />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <select id="invite-role" className={selectClassName} {...form.register("role")}>
                <option value="OPS">Operations</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
