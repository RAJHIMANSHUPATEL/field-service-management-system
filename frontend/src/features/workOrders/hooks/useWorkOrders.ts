import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptWorkOrder,
  assignWorkOrder,
  declineWorkOrder,
  getWorkOrder,
  listWorkOrders,
  moveVisit,
  addWorkOrderNote,
  completeVisit,
  saveVisitReport,
  signVisit,
  uploadVisitPhoto,
  addTimeOff,
  cancelVisit,
  getCalendar,
  listCandidates,
  reassignWorkOrder,
  rescheduleVisit,
  scheduleWorkOrder,
  workOrderKeys,
} from "../api/workOrders.api";
import type { VisitStep } from "../schemas/workOrder.schema";

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

export function useMoveVisit(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, step }: { visitId: string; step: VisitStep }) => moveVisit(visitId, step),
    onSuccess: refresh,
  });
}

export function useCandidates(id: string, enabled: boolean) {
  return useQuery({ queryKey: workOrderKeys.candidates(id), queryFn: () => listCandidates(id), enabled });
}

export function useReassignWorkOrder(id: string) {
  const refresh = useRefreshWorkOrder(id);
  return useMutation({
    mutationFn: ({ technicianId, reason }: { technicianId: string; reason: string }) =>
      reassignWorkOrder(id, technicianId, reason),
    onSuccess: refresh,
  });
}

export function useRescheduleVisit(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, scheduledStart, reason }: { visitId: string; scheduledStart: string; reason: string }) =>
      rescheduleVisit(visitId, scheduledStart, reason),
    onSuccess: refresh,
  });
}

export function useCancelVisit(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, reason }: { visitId: string; reason: string }) => cancelVisit(visitId, reason),
    onSuccess: refresh,
  });
}

export function useCalendar(from: string, to: string, technicianId: string) {
  return useQuery({
    queryKey: workOrderKeys.calendar(from, to, technicianId),
    queryFn: () => getCalendar(from, to, technicianId),
  });
}

export function useAddTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ technicianId, ...input }: { technicianId: string; startsAt: string; endsAt: string; reason?: string }) =>
      addTimeOff(technicianId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useSaveVisitReport(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, ...input }: { visitId: string; diagnosis?: string; workPerformed?: string }) =>
      saveVisitReport(visitId, input),
    onSuccess: refresh,
  });
}

export function useUploadVisitPhoto(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, file, caption }: { visitId: string; file: File; caption?: string }) =>
      uploadVisitPhoto(visitId, file, caption),
    onSuccess: refresh,
  });
}

export function useSignVisit(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({
    mutationFn: ({ visitId, signerName, image }: { visitId: string; signerName: string; image: string }) =>
      signVisit(visitId, signerName, image),
    onSuccess: refresh,
  });
}

export function useCompleteVisit(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({ mutationFn: (visitId: string) => completeVisit(visitId), onSuccess: refresh });
}

export function useAddWorkOrderNote(workOrderId: string) {
  const refresh = useRefreshWorkOrder(workOrderId);
  return useMutation({ mutationFn: (body: string) => addWorkOrderNote(workOrderId, body), onSuccess: refresh });
}
