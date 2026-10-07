import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptServiceRequest,
  createServiceRequest,
  getServiceRequest,
  listServiceRequests,
  rejectServiceRequest,
  replyToServiceRequest,
  requestServiceInfo,
  serviceRequestKeys,
  type ServiceRequestListQuery,
} from "../api/serviceRequests.api";

export function useServiceRequests(query: ServiceRequestListQuery = {}) {
  return useQuery({
    queryKey: serviceRequestKeys.list(query),
    queryFn: () => listServiceRequests(query),
  });
}

export function useServiceRequest(id: string) {
  return useQuery({
    queryKey: serviceRequestKeys.detail(id),
    queryFn: () => getServiceRequest(id),
  });
}

function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: serviceRequestKeys.detail(id) });
    }
  };
}

export function useCreateServiceRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: createServiceRequest,
    onSuccess: () => invalidate(),
  });
}

export function useAcceptServiceRequest(id: string) {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (input: { priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; note?: string }) =>
      acceptServiceRequest(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useRejectServiceRequest(id: string) {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (reason: string) => rejectServiceRequest(id, reason),
    onSuccess: () => invalidate(id),
  });
}

export function useRequestServiceInfo(id: string) {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (message: string) => requestServiceInfo(id, message),
    onSuccess: () => invalidate(id),
  });
}

export function useReplyToServiceRequest(id: string) {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (message: string) => replyToServiceRequest(id, message),
    onSuccess: () => invalidate(id),
  });
}
