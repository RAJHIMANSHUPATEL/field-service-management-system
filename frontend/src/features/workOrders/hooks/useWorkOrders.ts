import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptWorkOrder,
  assignWorkOrder,
  declineWorkOrder,
  getWorkOrder,
  listWorkOrders,
  scheduleWorkOrder,
  workOrderKeys,
} from "../api/workOrders.api";

export function useWorkOrders() {
  return useQuery({
    queryKey: workOrderKeys.all,
    queryFn: listWorkOrders,
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: workOrderKeys.detail(id),
    queryFn: () => getWorkOrder(id),
  });
}

function useRefreshWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
    void queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(id) });
  };
}

export function useAssignWorkOrder(id: string) {
  const refresh = useRefreshWorkOrder(id);
  return useMutation({
    mutationFn: (technicianId: string) => assignWorkOrder(id, technicianId),
    onSuccess: refresh,
  });
}

export function useScheduleWorkOrder(id: string) {
  const refresh = useRefreshWorkOrder(id);
  return useMutation({
    mutationFn: (scheduledStart: string) => scheduleWorkOrder(id, scheduledStart),
    onSuccess: refresh,
  });
}

export function useAcceptWorkOrder(id: string) {
  const refresh = useRefreshWorkOrder(id);
  return useMutation({
    mutationFn: () => acceptWorkOrder(id),
    onSuccess: refresh,
  });
}

export function useDeclineWorkOrder(id: string) {
  const refresh = useRefreshWorkOrder(id);
  return useMutation({
    mutationFn: (reason: string) => declineWorkOrder(id, reason),
    onSuccess: refresh,
  });
}
