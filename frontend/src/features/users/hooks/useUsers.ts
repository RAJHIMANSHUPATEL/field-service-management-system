import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authKeys } from "@/features/auth/api/auth.api";
import {
  acceptInvitation,
  confirmPasswordReset,
  inviteUser,
  listInvitations,
  listUsers,
  requestPasswordReset,
  revokeInvitation,
  userKeys,
} from "../api/users.api";

export function useUsers() {
  return useQuery({ queryKey: userKeys.all, queryFn: listUsers });
}

export function useInvitations() {
  return useQuery({ queryKey: userKeys.invitations, queryFn: listInvitations });
}

function useRefreshUsers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: userKeys.all });
  };
}

export function useInviteUser() {
  const refresh = useRefreshUsers();
  return useMutation({ mutationFn: inviteUser, onSuccess: refresh });
}

export function useRevokeInvitation() {
  const refresh = useRefreshUsers();
  return useMutation({ mutationFn: revokeInvitation, onSuccess: refresh });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => acceptInvitation(token, password),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      navigate("/");
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => confirmPasswordReset(token, password),
  });
}
