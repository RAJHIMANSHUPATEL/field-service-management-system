import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inbox,
  listDeliveries,
  listFeedback,
  listRules,
  markRead,
  notificationKeys,
  retryDelivery,
  runSweep,
  submitFeedback,
  updateRule,
  type DeliveryStatus,
  type NotificationRule,
} from "../api/notifications.api";

export function useInbox() {
  return useQuery({ queryKey: notificationKeys.inbox, queryFn: inbox, refetchInterval: 30_000 });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.inbox }),
  });
}

export function useDeliveries(status?: DeliveryStatus) {
  return useQuery({ queryKey: notificationKeys.deliveries(status), queryFn: () => listDeliveries(status) });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryDelivery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "deliveries"] }),
  });
}

export function useSweep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runSweep,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useRules(enabled: boolean) {
  return useQuery({ queryKey: notificationKeys.rules, queryFn: listRules, enabled });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<Pick<NotificationRule, "isEnabled" | "channels">>) => updateRule(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.rules }),
  });
}

export function useFeedback() {
  return useQuery({ queryKey: notificationKeys.feedback, queryFn: listFeedback });
}

export function useSubmitFeedback(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rating: number; satisfied: boolean; comment?: string }) => submitFeedback(workOrderId, input),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
